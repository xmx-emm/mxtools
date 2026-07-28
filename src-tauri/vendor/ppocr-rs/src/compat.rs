//! Compat shim per la differenza API `try_extract_tensor` tra ort
//! 2.0.0-rc.9 (qui pinnato) e 2.0.0-rc.11 (paddle-ocr-rs upstream).
//!
//! ## Differenza API
//!
//! In **rc.11** la firma di `Value::try_extract_tensor::<T>()` ritorna una
//! tupla `(Vec<i64>, &[T])` con shape e raw slice — pratico ma rotto rispetto
//! a rc.9.
//!
//! In **rc.9** la firma ritorna `Result<ArrayViewD<T>, ort::Error>`. Per
//! ottenere shape e dati separatamente serve `view.shape().to_vec()` +
//! `view.iter().copied().collect()` o `into_owned().into_raw_vec()`.
//!
//! Questo modulo isola la differenza in un unico punto. `ort rc.9` è la
//! versione target permanente del workspace (rc.11+ si blocca su ARM64
//! Snapdragon X Elite), quindi questo shim è stabile e non verrà rimosso.

use ort::value::Value;
use crate::ocr_error::OcrError;

/// Estrae un tensore f32 come `Vec<f32>`, scartando la shape.
/// Equivalente al `try_extract_tensor::<f32>()?.1.to_vec()` di rc.11.
pub fn tensor_to_vec_f32(value: &Value) -> Result<Vec<f32>, OcrError> {
    let view = value.try_extract_tensor::<f32>()?;
    Ok(view.iter().copied().collect())
}

/// Estrae un tensore f32 con la shape (per output di shape variabile).
/// Equivalente al `let (shape, data) = try_extract_tensor::<f32>()?;` di rc.11.
///
/// Ritorna `(shape, data)` con shape già copiata in `Vec<i64>`.
pub fn tensor_extract_with_shape_f32(value: &Value) -> Result<(Vec<i64>, Vec<f32>), OcrError> {
    let view = value.try_extract_tensor::<f32>()?;
    let shape: Vec<i64> = view.shape().iter().map(|&d| d as i64).collect();
    let data:  Vec<f32> = view.iter().copied().collect();
    Ok((shape, data))
}
