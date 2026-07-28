use ort::session::Session;
use ort::value::Tensor;
use ort::{inputs, session::builder::SessionBuilder};
use std::collections::HashMap;

use crate::{base_net::BaseNet, ocr_error::OcrError, ocr_result::TextLine, ocr_utils::OcrUtils};

/// Singolo char dedup-survived dell'output CTC: timestep + score, indicizzato
/// 1:1 con `text.chars()`. Esposto pub(crate) per `score_to_text_line` →
/// `get_text_line_with_wh_ratio` → `ocr_lite::detect_once` (che trasforma le
/// timestep range in word-box image-space).
#[derive(Debug, Clone, Copy)]
pub(crate) struct CtcSelection {
    pub timestep: usize,
    pub score:    f32,
}

/// Range timestep di una singola word, già raggruppata da
/// `selection_to_words`. La conversione timestep → x in crop space è
/// responsabilità del chiamante (richiede `target_w` e `T` del CRNN run).
#[derive(Debug, Clone)]
pub(crate) struct WordRange {
    pub text:     String,
    pub start_ts: usize,
    pub end_ts:   usize,
    pub score:    f32,
}

pub(crate) const CRNN_DST_HEIGHT: u32 = 48;
const MEAN_VALUES: [f32; 3] = [127.5, 127.5, 127.5];
const NORM_VALUES: [f32; 3] = [1.0 / 127.5, 1.0 / 127.5, 1.0 / 127.5];

#[derive(Debug)]
pub struct CrnnNet {
    session: Option<Session>,
    keys: Vec<String>,
    input_names: Vec<String>,
}

impl BaseNet for CrnnNet {
    fn new() -> Self {
        Self {
            session: None,
            keys: Vec::new(),
            input_names: Vec::new(),
        }
    }

    fn set_input_names(&mut self, input_names: Vec<String>) {
        self.input_names = input_names;
    }

    fn set_session(&mut self, session: Option<Session>) {
        self.session = session;
    }
}

impl CrnnNet {
    pub fn init_model(
        &mut self,
        path: &str,
        num_thread: usize,
        builder_fn: Option<fn(SessionBuilder) -> Result<SessionBuilder, ort::Error>>,
    ) -> Result<(), OcrError> {
        BaseNet::init_model(self, path, num_thread, builder_fn)?;

        self.keys = self.get_keys()?;

        Ok(())
    }

    pub fn init_model_dict_file(
        &mut self,
        path: &str,
        num_thread: usize,
        builder_fn: Option<fn(SessionBuilder) -> Result<SessionBuilder, ort::Error>>,
        dict_file_path: &str,
    ) -> Result<(), OcrError> {
        BaseNet::init_model(self, path, num_thread, builder_fn)?;

        self.read_keys_from_file(dict_file_path)?;

        Ok(())
    }

    pub fn init_model_from_memory(
        &mut self,
        model_bytes: &[u8],
        num_thread: usize,
        builder_fn: Option<fn(SessionBuilder) -> Result<SessionBuilder, ort::Error>>,
    ) -> Result<(), OcrError> {
        BaseNet::init_model_from_memory(self, model_bytes, num_thread, builder_fn)?;

        self.keys = self.get_keys()?;

        Ok(())
    }

    fn get_keys(&mut self) -> Result<Vec<String>, OcrError> {
        // [downport rc.11→rc.9] in rc.11 `metadata().custom("character")`
        // ritorna `Result<Option<String>>`; in rc.9 ritorna anche
        // `Result<Option<String>>` ma il chain con `.expect()` × 2 lascia
        // un Option<String> all'esterno. Doppio `.expect()` per ottenere
        // la String.
        let model_charater_list = self
            .session
            .as_ref()
            .expect("crnn_net session not initialized")
            .metadata()
            .expect("crnn_net metadata not initialized")
            .custom("character")
            .expect("crnn_net character meta not found")
            .expect("crnn_net character meta is None");

        let mut keys = Vec::with_capacity((model_charater_list.len() as f32 / 3.9) as usize);

        keys.push("#".to_string());

        keys.extend(model_charater_list.split('\n').map(|s: &str| s.to_string()));

        keys.push(" ".to_string());

        Ok(keys)
    }

    fn read_keys_from_file(&mut self, path: &str) -> Result<(), OcrError> {
        let content = std::fs::read_to_string(path)?;
        let mut keys = Vec::new();

        // Index 0 = CTC blank token.
        keys.push("#".to_string());

        // Ogni riga del dict corrisponde a un token del modello ONNX.
        // NON filtrare le righe interne vuote: alcune entry del dict (es.
        // il carattere spazio rappresentato come riga vuota in YAML/dict)
        // hanno posizione fissa nel vocabolario — filtrarle shifta tutti i
        // token successivi di 1, rendendo la predizione inutilizzabile.
        // Si rimuove SOLO l'ultima riga vuota causata dal `\n` finale del
        // file. Su Windows strip `\r` prima del confronto.
        let mut lines: Vec<&str> = content.split('\n').collect();
        if lines.last().map_or(false, |l| l.trim_end_matches('\r').is_empty()) {
            lines.pop();
        }
        keys.extend(lines.iter().map(|s| s.trim_end_matches('\r').to_string()));

        // Indice finale = token space (use_space_char=True nel training).
        keys.push(" ".to_string());

        self.keys = keys;
        Ok(())
    }

    pub fn get_text_lines(
        &mut self,
        part_imgs: &[image::RgbImage],
        angle_rollback_records: &HashMap<usize, image::RgbImage>,
        angle_rollback_threshold: f32,
    ) -> Result<Vec<TextLine>, OcrError> {
        let lines_with_words = self.get_text_lines_with_word_ranges(
            part_imgs,
            angle_rollback_records,
            angle_rollback_threshold,
        )?;
        Ok(lines_with_words.into_iter().map(|(line, _, _, _, _)| line).collect())
    }

    /// Variante che ritorna anche i word-range CTC + le dimensioni del crop
    /// e il `target_w` usato in input al CRNN — informazioni necessarie a
    /// `ocr_lite::detect_once` per mappare timestep → image-space.
    ///
    /// Tuple: `(TextLine, Vec<WordRange>, crop_size, target_w, num_timesteps)`.
    /// `crop_size` è la dimensione dell'immagine crop ricevuta in input
    /// (può essere quella ruotata 90° in caso `crop_h >= crop_w*3/2` —
    /// vedi `OcrUtils::get_rotate_crop_image`).
    pub(crate) fn get_text_lines_with_word_ranges(
        &mut self,
        part_imgs: &[image::RgbImage],
        angle_rollback_records: &HashMap<usize, image::RgbImage>,
        angle_rollback_threshold: f32,
    ) -> Result<Vec<(TextLine, Vec<WordRange>, (u32, u32), usize, usize)>, OcrError> {
        let mut out = Vec::with_capacity(part_imgs.len());

        // Compute max width/height ratio across all images in the batch.
        let base_wh_ratio = 320.0 / CRNN_DST_HEIGHT as f32;
        let max_wh_ratio = part_imgs
            .iter()
            .map(|img| img.width() as f32 / img.height().max(1) as f32)
            .fold(base_wh_ratio, f32::max);

        for (index, img) in part_imgs.iter().enumerate() {
            let mut entry = self.recognize_one(img, max_wh_ratio)?;
            // Angle rollback: se confidence troppo bassa e abbiamo l'originale,
            // ritriamo con la versione non ruotata.
            if entry.0.text_score.is_nan() || entry.0.text_score < angle_rollback_threshold {
                if let Some(rollback_img) = angle_rollback_records.get(&index) {
                    entry = self.recognize_one(rollback_img, max_wh_ratio)?;
                }
            }
            out.push(entry);
        }
        Ok(out)
    }

    /// Helper: esegue CRNN su una singola line crop e ritorna `TextLine` +
    /// metadata word-level. La `TextLine.words` qui resta sempre vuota; il
    /// caller (`ocr_lite::detect_once`) la popola dopo aver fatto l'inverse
    /// warp dei `WordRange`.
    fn recognize_one(
        &mut self,
        img_src: &image::RgbImage,
        max_wh_ratio: f32,
    ) -> Result<(TextLine, Vec<WordRange>, (u32, u32), usize, usize), OcrError> {
        let crop_size = (img_src.width(), img_src.height());
        let (line, selection, target_w, t) =
            self.get_text_line_with_wh_ratio(img_src, max_wh_ratio)?;
        let words = selection_to_word_ranges(&line.text, &selection);
        Ok((line, words, crop_size, target_w, t))
    }

    /// Recognize a single text line image with an optional max width/height ratio
    /// for padding. When `max_wh_ratio > 0`, the normalized tensor is zero-padded
    /// on the right to `(48 * max_wh_ratio)` pixels. This matches Python PaddleOCR's
    /// `resize_norm_img` which pads to a fixed batch width.
    ///
    /// Ritorna `(TextLine, selection, target_w, T)`:
    /// - `TextLine.words` resta vuoto (popolato dal caller dopo inverse-warp).
    /// - `selection` è `Vec<CtcSelection>` indicizzato 1:1 con `text.chars()`.
    /// - `target_w` = larghezza in pixel dell'input al CRNN (post-padding).
    /// - `T` = numero di timestep dell'output CRNN (height del tensor 1D).
    fn get_text_line_with_wh_ratio(
        &mut self,
        img_src: &image::RgbImage,
        max_wh_ratio: f32,
    ) -> Result<(TextLine, Vec<CtcSelection>, usize, usize), OcrError> {
        let Some(session) = &mut self.session else {
            return Err(OcrError::SessionNotInitialized);
        };

        let scale = CRNN_DST_HEIGHT as f32 / img_src.height() as f32;
        let resized_w = (img_src.width() as f32 * scale).ceil() as u32;

        let src_resize = image::imageops::resize(
            img_src,
            resized_w,
            CRNN_DST_HEIGHT,
            image::imageops::FilterType::Triangle,
        );

        let input_tensors =
            OcrUtils::substract_mean_normalize(&src_resize, &MEAN_VALUES, &NORM_VALUES);

        // Zero-pad to the target width if max_wh_ratio is specified.
        // Python PaddleOCR pads recognition inputs to (48 * max_wh_ratio) with zeros.
        // Zero in normalized space = (0/127.5 - 1.0) = -1.0, but Python uses actual
        // 0.0 in its padded tensor (the padding is applied AFTER normalization).
        let target_w_raw = (CRNN_DST_HEIGHT as f32 * max_wh_ratio) as u32;
        let target_w = target_w_raw.max(resized_w);
        let input_tensors = if max_wh_ratio > 0.0 && target_w > resized_w {
            let shape = input_tensors.shape();
            let c = shape[1];
            let h = shape[2];
            let mut padded = ndarray::Array4::<f32>::zeros((1, c, h, target_w as usize));
            padded
                .slice_mut(ndarray::s![.., .., .., ..resized_w as usize])
                .assign(&input_tensors);
            padded
        } else {
            input_tensors
        };
        // Effective input width seen by CRNN (post-padding).
        let effective_target_w = if max_wh_ratio > 0.0 { target_w } else { resized_w };

        let input_tensors = Tensor::from_array(input_tensors)?;

        // [downport rc.11→rc.9] inputs! macro ritorna Result in rc.9
        let outputs = session.run(inputs![self.input_names[0].clone() => input_tensors]?)?;

        let (_, red_data) = outputs.iter().next().unwrap();

        // [downport rc.11→rc.9] rc.11 ritorna (shape, &[T]); rc.9 ritorna ArrayViewD<T>.
        let (shape_vec, src_data) = crate::compat::tensor_extract_with_shape_f32(&red_data)?;
        // shape = (1, T, V): timestep × vocab.
        let timesteps = shape_vec[1] as usize;
        let vocab     = shape_vec[2] as usize;

        let (line, selection) = Self::score_to_text_line(&src_data, timesteps, vocab, &self.keys)?;
        Ok((line, selection, effective_target_w as usize, timesteps))
    }

    /// Decoder CTC greedy: per ogni timestep prende l'argmax sul vocab,
    /// applica dedup (skip blank=0 + skip ripetizioni dello stesso index
    /// rispetto al precedente), accumula `text` e `selection` (un entry
    /// per ogni char dedup-survived).
    ///
    /// **Identità**: `selection.len() == text.chars().count()`. Vale solo
    /// quando ogni `keys[i]` è un singolo grapheme — vero per i modelli
    /// latin di PaddleOCR (dict_latin = 1 char per linea).
    fn score_to_text_line(
        output_data: &[f32],
        timesteps:   usize,
        vocab:       usize,
        keys:        &[String],
    ) -> Result<(TextLine, Vec<CtcSelection>), OcrError> {
        let mut text_line = TextLine::default();
        let mut selection: Vec<CtcSelection> = Vec::with_capacity(timesteps);
        let mut last_index = 0usize;
        let mut text_score_sum = 0.0f32;
        let mut text_score_count = 0usize;

        for i in 0..timesteps {
            let start = i * vocab;
            let stop  = (i + 1) * vocab;
            let slice = &output_data[start..stop.min(output_data.len())];

            let (max_index, max_value) = slice
                .iter()
                .enumerate()
                .fold((0usize, f32::MIN), |(max_idx, max_val), (idx, &val)| {
                    if val > max_val { (idx, val) } else { (max_idx, max_val) }
                });

            if max_index > 0 && max_index < keys.len() && !(i > 0 && max_index == last_index) {
                let token = &keys[max_index];
                text_line.text.push_str(token);
                // Dictionary entries are usually one scalar, but some model
                // packs contain multi-scalar tokens. Word-range indexing is
                // character based, so each emitted scalar needs a matching
                // CTC selection entry.
                selection.extend(token.chars().map(|_| CtcSelection {
                    timestep: i,
                    score: max_value,
                }));
                text_score_sum += max_value;
                text_score_count += 1;
            }
            last_index = max_index;
        }

        text_line.text_score = if text_score_count > 0 {
            text_score_sum / text_score_count as f32
        } else {
            0.0
        };
        Ok((text_line, selection))
    }
}

/// Group consecutive alphanumeric chars dell'output CTC in word ranges.
/// I delimiter (whitespace, punctuation) chiudono il word corrente.
///
/// Convenzione (allineata a `tools/infer/predict_rec.py::get_word_info`):
/// - Char alphanumeric (Unicode-aware via [`char::is_alphanumeric`]) →
///   appartengono al word corrente. Lettere accentate EU incluse.
/// - Whitespace/punctuation → delimitatori, ignorati e chiudono il word.
///
/// **Identità**: `text.chars().count() == selection.len()` (vedi
/// `score_to_text_line`).
pub(crate) fn selection_to_word_ranges(text: &str, selection: &[CtcSelection]) -> Vec<WordRange> {
    let chars: Vec<char> = text.chars().collect();
    debug_assert_eq!(chars.len(), selection.len(),
        "selection deve essere indicizzato 1:1 con text.chars()");

    let mut words = Vec::new();
    let mut buf_text  = String::new();
    let mut buf_first: Option<usize> = None; // primo char-index del word in selection
    let mut buf_last:  usize = 0;
    let mut buf_score_sum = 0.0f32;
    let mut buf_score_n   = 0usize;

    let flush = |words: &mut Vec<WordRange>,
                 buf_text:  &mut String,
                 buf_first: &mut Option<usize>,
                 buf_last:  usize,
                 score_sum: f32,
                 score_n:   usize| {
        if let Some(first) = *buf_first {
            if !buf_text.is_empty() {
                words.push(WordRange {
                    text:     std::mem::take(buf_text),
                    start_ts: selection[first].timestep,
                    end_ts:   selection[buf_last].timestep,
                    score:    if score_n > 0 { score_sum / score_n as f32 } else { 0.0 },
                });
            }
            *buf_first = None;
        }
    };

    for (i, ch) in chars.iter().enumerate() {
        if ch.is_alphanumeric() {
            buf_text.push(*ch);
            if buf_first.is_none() { buf_first = Some(i); }
            buf_last = i;
            buf_score_sum += selection[i].score;
            buf_score_n   += 1;
        } else {
            flush(&mut words, &mut buf_text, &mut buf_first, buf_last, buf_score_sum, buf_score_n);
            buf_score_sum = 0.0;
            buf_score_n   = 0;
        }
    }
    flush(&mut words, &mut buf_text, &mut buf_first, buf_last, buf_score_sum, buf_score_n);
    words
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sel(timesteps: &[(usize, f32)]) -> Vec<CtcSelection> {
        timesteps.iter().map(|&(t, s)| CtcSelection { timestep: t, score: s }).collect()
    }

    #[test]
    fn word_grouping_simple() {
        // "Hello world" — 11 chars (incluso lo spazio).
        let text = "Hello world";
        let selection = sel(&[
            (0, 0.9), (2, 0.9), (3, 0.9), (4, 0.9), (5, 0.9),  // "Hello"
            (7, 0.0),                                          // " "
            (10, 0.9), (11, 0.9), (12, 0.9), (13, 0.9), (14, 0.9), // "world"
        ]);
        let words = selection_to_word_ranges(text, &selection);
        assert_eq!(words.len(), 2);
        assert_eq!(words[0].text, "Hello");
        assert_eq!(words[0].start_ts, 0);
        assert_eq!(words[0].end_ts,   5);
        assert_eq!(words[1].text, "world");
        assert_eq!(words[1].start_ts, 10);
        assert_eq!(words[1].end_ts,   14);
    }

    #[test]
    fn word_grouping_punctuation() {
        // "Hello, world!" — la "," chiude "Hello", il "!" non apre nulla.
        let text = "Hello, world!";
        let selection = sel(&[
            (0, 0.9), (1, 0.9), (2, 0.9), (3, 0.9), (4, 0.9),  // "Hello"
            (5, 0.5),                                          // ","
            (6, 0.0),                                          // " "
            (7, 0.9), (8, 0.9), (9, 0.9), (10, 0.9), (11, 0.9),// "world"
            (12, 0.5),                                         // "!"
        ]);
        let words = selection_to_word_ranges(text, &selection);
        assert_eq!(words.len(), 2);
        assert_eq!(words[0].text, "Hello");
        assert_eq!(words[1].text, "world");
    }

    #[test]
    fn word_grouping_accented() {
        // Caratteri accentati EU: "città è grande".
        let text = "città è grande";
        let n = text.chars().count();
        let selection: Vec<CtcSelection> = (0..n)
            .map(|i| CtcSelection { timestep: i, score: 0.9 })
            .collect();
        let words = selection_to_word_ranges(text, &selection);
        assert_eq!(words.len(), 3);
        assert_eq!(words[0].text, "città");
        assert_eq!(words[1].text, "è");
        assert_eq!(words[2].text, "grande");
    }

    #[test]
    fn word_grouping_empty_selection() {
        let words = selection_to_word_ranges("", &[]);
        assert!(words.is_empty());
    }

    #[test]
    fn word_grouping_only_punctuation() {
        let text = "...!?";
        let selection = sel(&[(0, 0.5), (1, 0.5), (2, 0.5), (3, 0.5), (4, 0.5)]);
        let words = selection_to_word_ranges(text, &selection);
        assert!(words.is_empty(), "solo punctuation → nessun word");
    }
}
