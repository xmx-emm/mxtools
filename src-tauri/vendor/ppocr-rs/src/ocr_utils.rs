use crate::{
    ocr_error::OcrError,
    ocr_result::{Point, TextBox},
};
use image::imageops;
use imageproc::geometric_transformations::{Interpolation, Projection};
use ndarray::{Array, Array4};

pub struct OcrUtils;

impl OcrUtils {
    pub fn substract_mean_normalize(
        img_src: &image::RgbImage,
        mean_vals: &[f32],
        norm_vals: &[f32],
    ) -> Array4<f32> {
        let cols = img_src.width();
        let rows = img_src.height();
        let channels = 3;

        let mut input_tensor = Array::zeros((1, channels as usize, rows as usize, cols as usize));

        // 获取图像数据
        unsafe {
            for r in 0..rows {
                for c in 0..cols {
                    for ch in 0..channels {
                        let idx = (r * cols * channels + c * channels + ch) as usize;
                        let value = img_src.get_unchecked(idx).to_owned();
                        let data = value as f32 * norm_vals[ch as usize]
                            - mean_vals[ch as usize] * norm_vals[ch as usize];
                        input_tensor[[0, ch as usize, r as usize, c as usize]] = data;
                    }
                }
            }
        }

        input_tensor
    }

    pub fn make_padding(
        img_src: &image::RgbImage,
        padding: u32,
    ) -> Result<image::RgbImage, OcrError> {
        if padding == 0 {
            return Ok(img_src.clone());
        }

        let width = img_src.width();
        let height = img_src.height();

        let mut padding_src = image::RgbImage::new(width + 2 * padding, height + 2 * padding);
        imageproc::drawing::draw_filled_rect_mut(
            &mut padding_src,
            imageproc::rect::Rect::at(0, 0).of_size(width + 2 * padding, height + 2 * padding),
            image::Rgb([255, 255, 255]),
        );

        image::imageops::replace(&mut padding_src, img_src, padding as i64, padding as i64);

        Ok(padding_src)
    }

    pub fn get_part_images(
        img_src: &image::RgbImage,
        text_boxes: &[TextBox],
    ) -> Vec<image::RgbImage> {
        text_boxes
            .iter()
            .map(|text_box| Self::get_rotate_crop_image(img_src, &text_box.points))
            .collect()
    }

    pub fn get_rotate_crop_image(
        img_src: &image::RgbImage,
        box_points: &[Point],
    ) -> image::RgbImage {
        let mut points = box_points.to_vec();

        // 计算边界框
        let (min_x, min_y, max_x, max_y) = points.iter().fold(
            (u32::MAX, u32::MAX, 0u32, 0u32),
            |(min_x, min_y, max_x, max_y), point| {
                (
                    min_x.min(point.x),
                    min_y.min(point.y),
                    max_x.max(point.x),
                    max_y.max(point.y),
                )
            },
        );

        // 裁剪图像
        let img_crop =
            imageops::crop_imm(img_src, min_x, min_y, max_x - min_x, max_y - min_y).to_image();

        for point in &mut points {
            point.x -= min_x;
            point.y -= min_y;
        }

        let img_crop_width = ((points[0].x as i32 - points[1].x as i32).pow(2) as f32
            + (points[0].y as i32 - points[1].y as i32).pow(2) as f32)
            .sqrt() as u32;
        let img_crop_height = ((points[0].x as i32 - points[3].x as i32).pow(2) as f32
            + (points[0].y as i32 - points[3].y as i32).pow(2) as f32)
            .sqrt() as u32;

        let src_points = [
            (points[0].x as f32, points[0].y as f32),
            (points[1].x as f32, points[1].y as f32),
            (points[2].x as f32, points[2].y as f32),
            (points[3].x as f32, points[3].y as f32),
        ];

        let dst_points = [
            (0.0, 0.0),
            (img_crop_width as f32, 0.0),
            (img_crop_width as f32, img_crop_height as f32),
            (0.0, img_crop_height as f32),
        ];

        let projection = Projection::from_control_points(src_points, dst_points)
            .expect("Failed to create projection transformation");

        let mut part_img = image::RgbImage::new(img_crop_width, img_crop_height);
        imageproc::geometric_transformations::warp_into(
            &img_crop,
            &projection,
            Interpolation::Bilinear,
            image::Rgb([255, 255, 255]),
            &mut part_img,
        );

        // 根据需要旋转图像
        if part_img.height() >= part_img.width() * 3 / 2 {
            let mut rotated = image::RgbImage::new(part_img.height(), part_img.width());

            for (x, y, pixel) in part_img.enumerate_pixels() {
                rotated.put_pixel(y, part_img.width() - 1 - x, *pixel);
            }

            rotated
        } else {
            part_img
        }
    }

    pub fn mat_rotate_clock_wise_180(src: &mut image::RgbImage) {
        imageops::rotate180_in_place(src);
    }

    pub fn calculate_mean_with_mask(
        img: &image::ImageBuffer<image::Luma<f32>, Vec<f32>>,
        mask: &image::ImageBuffer<image::Luma<u8>, Vec<u8>>,
    ) -> f32 {
        let mut sum: f32 = 0.0;
        let mut mask_count = 0;

        assert_eq!(img.width(), mask.width());
        assert_eq!(img.height(), mask.height());

        for y in 0..img.height() {
            for x in 0..img.width() {
                let mask_value = mask.get_pixel(x, y)[0];
                if mask_value > 0 {
                    let pixel = img.get_pixel(x, y);
                    sum += pixel[0];
                    mask_count += 1;
                }
            }
        }

        if mask_count == 0 {
            return 0.0;
        }

        sum / mask_count as f32
    }

    /// Centroide (x, y) di un poligono. Usato per associare text-block a
    /// layout-box (containment via centroid + nearest-neighbor su orphan).
    /// Ritorna `(0, 0)` se il poligono è vuoto.
    pub fn polygon_centroid(points: &[Point]) -> (u32, u32) {
        if points.is_empty() { return (0, 0); }
        let n = points.len() as u32;
        let sx: u32 = points.iter().map(|p| p.x).sum();
        let sy: u32 = points.iter().map(|p| p.y).sum();
        (sx / n, sy / n)
    }

    /// Inversa della trasformazione applicata da `get_rotate_crop_image`:
    /// dato il polygon DBNet della linea (4 corner nello spazio
    /// dell'immagine originale) e un rettangolo `(crop_w, crop_h)` (il
    /// rettangolo target del crop+warp), trasforma 4 punti dal CROP-SPACE
    /// (rettangolo) all'IMAGE-SPACE (polygon).
    ///
    /// Usato per riportare i word-box dal CRNN-cropped-line space allo
    /// spazio dell'immagine originale.
    ///
    /// `quad_in_crop` è array di 4 `(x, y)` in `[0..crop_w] × [0..crop_h]`.
    /// Ritorna 4 `Point` clampati a `u32`. Se la `Projection::invert()`
    /// fallisce (raro: polygon degenerato), ritorna `None`.
    ///
    /// **Nota**: questa funzione NON gestisce la rotazione 90° applicata
    /// quando `crop_h >= crop_w * 3/2` (vedi `get_rotate_crop_image`).
    /// Per quelle linee, il chiamante deve saltare il word-level (testo
    /// verticale, edge case non supportato).
    pub fn inverse_warp_quad(
        line_polygon: &[Point; 4],
        crop_size: (u32, u32),
        quad_in_crop: &[(f32, f32); 4],
    ) -> Option<[Point; 4]> {
        // Replica la stessa logica di get_rotate_crop_image: shift al
        // (min_x, min_y) del polygon e lavora in coordinate relative.
        let (min_x, min_y, _, _) = line_polygon.iter().fold(
            (u32::MAX, u32::MAX, 0u32, 0u32),
            |(mn_x, mn_y, mx_x, mx_y), p| (mn_x.min(p.x), mn_y.min(p.y), mx_x.max(p.x), mx_y.max(p.y)),
        );
        let src_points: [(f32, f32); 4] = [
            ((line_polygon[0].x - min_x) as f32, (line_polygon[0].y - min_y) as f32),
            ((line_polygon[1].x - min_x) as f32, (line_polygon[1].y - min_y) as f32),
            ((line_polygon[2].x - min_x) as f32, (line_polygon[2].y - min_y) as f32),
            ((line_polygon[3].x - min_x) as f32, (line_polygon[3].y - min_y) as f32),
        ];
        let (cw, ch) = (crop_size.0 as f32, crop_size.1 as f32);
        let dst_points: [(f32, f32); 4] = [
            (0.0, 0.0),
            (cw,  0.0),
            (cw,  ch),
            (0.0, ch),
        ];

        // get_rotate_crop_image usa Projection::from_control_points(src, dst)
        // per andare polygon→rect. Per andare rect→polygon serviamo l'inversa.
        let proj = imageproc::geometric_transformations::Projection::from_control_points(
            src_points, dst_points,
        )?.invert();

        let mut out = [Point { x: 0, y: 0 }; 4];
        for (i, &(qx, qy)) in quad_in_crop.iter().enumerate() {
            let (mapped_x, mapped_y) = proj * (qx, qy);
            // Aggiungi back l'offset (min_x, min_y) per ritornare al sistema
            // dell'immagine originale.
            let abs_x = (mapped_x.max(0.0) as u32).saturating_add(min_x);
            let abs_y = (mapped_y.max(0.0) as u32).saturating_add(min_y);
            out[i] = Point { x: abs_x, y: abs_y };
        }
        Some(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inverse_warp_axis_aligned_roundtrip() {
        // Polygon axis-aligned 100×30 a (50, 200).
        let poly = [
            Point { x: 50,  y: 200 },
            Point { x: 150, y: 200 },
            Point { x: 150, y: 230 },
            Point { x: 50,  y: 230 },
        ];
        let crop_size = (200u32, 60u32); // mappato su rect 200×60

        // Quad: il word "Hello" copre x=[40, 80] del crop.
        let word_quad = [(40.0, 0.0), (80.0, 0.0), (80.0, 60.0), (40.0, 60.0)];
        let result = OcrUtils::inverse_warp_quad(&poly, crop_size, &word_quad).unwrap();

        // Atteso: x = 50 + (40/200)*100 = 70, x = 50 + (80/200)*100 = 90, y full poly height.
        assert_eq!(result[0].x, 70);
        assert_eq!(result[0].y, 200);
        assert_eq!(result[1].x, 90);
        assert_eq!(result[1].y, 200);
        assert_eq!(result[2].x, 90);
        assert_eq!(result[2].y, 230);
        assert_eq!(result[3].x, 70);
        assert_eq!(result[3].y, 230);
    }

    #[test]
    fn inverse_warp_corners_match_polygon() {
        // Quad = full crop → deve mappare ai 4 corner del polygon.
        let poly = [
            Point { x: 100, y: 50 },
            Point { x: 300, y: 60 },
            Point { x: 295, y: 90 },
            Point { x: 95,  y: 80 },
        ];
        let crop_size = (200u32, 30u32);
        let full_crop = [(0.0, 0.0), (200.0, 0.0), (200.0, 30.0), (0.0, 30.0)];
        let result = OcrUtils::inverse_warp_quad(&poly, crop_size, &full_crop).unwrap();

        // Tolerance ±2 px per arrotondamenti f32→u32.
        for (i, p) in result.iter().enumerate() {
            let dx = (p.x as i32 - poly[i].x as i32).abs();
            let dy = (p.y as i32 - poly[i].y as i32).abs();
            assert!(dx <= 2, "corner {i} x: got {} expected {} (Δ={})", p.x, poly[i].x, dx);
            assert!(dy <= 2, "corner {i} y: got {} expected {} (Δ={})", p.y, poly[i].y, dy);
        }
    }
}
