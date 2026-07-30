//! APEX Q 抛射角经验公式（移植自 NYTN02/APEX_thetacalculation `calculate.cpp`）。

use serde::Serialize;
use std::f64::consts::PI;

const LOW_PARAMS: [f64; 38] = [
    0.05906051,
    0.01922017,
    -0.09128481,
    0.00227226,
    -0.00034493,
    0.00000029,
    0.00505409,
    -0.00009850,
    0.00455790,
    -0.05668212,
    0.01808962,
    0.02486718,
    0.00000941,
    0.01426906,
    0.01337904,
    -0.00347473,
    0.00585867,
    -0.00318687,
    0.00620625,
    -0.01442806,
    0.00265681,
    0.01354817,
    0.01208332,
    0.01058386,
    -0.00150257,
    0.01667214,
    0.00983190,
    -0.00946299,
    0.03288948,
    0.00304788,
    0.00352337,
    0.00714029,
    -0.00714395,
    -0.03475796,
    0.01317679,
    0.08707241,
    0.03757451,
    0.00491534,
];

const HIGH_PARAMS: [f64; 20] = [
    0.31953025,
    -0.00230637,
    0.00030090,
    0.00005720,
    -0.00210798,
    -0.15638930,
    0.72346818,
    -0.19508769,
    0.69479213,
    0.43230354,
    0.67890975,
    0.60368317,
    0.83926671,
    -1.21558890,
    -1.10351086,
    0.22915913,
    -0.33235095,
    0.26818104,
    0.08942329,
    1.45841379,
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThetaResult {
    pub r: f64,
    pub alpha: f64,
    pub theta_low_orig: f64,
    pub theta_high_orig: f64,
    pub theta_low: f64,
    pub theta_high: f64,
    pub recommended_low: f64,
    pub recommended_high: f64,
    pub out_of_range: bool,
}

fn deg2rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

fn rad2deg(rad: f64) -> f64 {
    rad * 180.0 / PI
}

fn constrain_theta(theta: f64) -> f64 {
    theta.clamp(-90.0, 90.0)
}

fn calculate_k_effective(theta_deg: f64) -> f64 {
    const K_BASE: f64 = 0.002138;
    const C1: f64 = 8.308074e-4;
    const C2: f64 = 9.296451e-5;
    K_BASE * (1.0 + C1 * theta_deg + C2 * theta_deg * theta_deg)
}

fn solve_theta<F>(func: F, mut x0: f64, mut x1: f64) -> Option<f64>
where
    F: Fn(f64) -> f64,
{
    const MAX_ITER: i32 = 50;
    const TOL: f64 = 1e-6;
    let mut f0 = func(x0);
    let mut f1 = func(x1);
    for _ in 0..MAX_ITER {
        if (f1 - f0).abs() < 1e-12 {
            break;
        }
        let x2 = x1 - f1 * (x1 - x0) / (f1 - f0);
        let f2 = func(x2);
        if f2.abs() < TOL {
            return Some(x2);
        }
        x0 = x1;
        f0 = f1;
        x1 = x2;
        f1 = f2;
    }
    Some(x1)
}

fn calculate_original_theta(r: f64, alpha_rad: f64, init_theta_deg: f64) -> f64 {
    let k_eff = calculate_k_effective(init_theta_deg);
    let func = |theta_rad: f64| {
        let s = theta_rad.sin();
        2.0 * alpha_rad.sin() * (1.0 - s * s)
            - alpha_rad.cos() * ((2.0 * theta_rad).sin() - k_eff * r * alpha_rad.cos())
    };
    let t0 = deg2rad(init_theta_deg - 5.0);
    let t1 = deg2rad(init_theta_deg + 5.0);
    match solve_theta(func, t0, t1) {
        Some(theta_rad) => rad2deg(theta_rad),
        None => init_theta_deg,
    }
}

fn calculate_correction_low(p: &[f64; 38], r: f64, a: f64) -> f64 {
    let mut corr = 0.0;
    corr += p[0] * r + p[1] * a * a + p[2] * a.powi(3) + p[3] * a.powi(4);
    corr += p[4] * r * r + p[5] * r.powi(3) + p[6] * r * a + p[7] * r * r * a;
    corr += p[8] * r * a * a + p[9] * a.sin() + p[10] * a.cos() + p[11] * a.abs();
    corr += p[12] * (-r / 1000.0).exp() + p[13] * (-r / 500.0).exp() + p[14] * (-r / 250.0).exp();
    corr += p[15] * (-a.abs() / 10.0).exp() + p[16] * (-a.abs() / 5.0).exp();
    corr += p[17] * (r + 1.0).ln() + p[18] * (a.abs() + 1.0).ln();
    corr += p[19] * (r / 100.0).sin() + p[20] * (r / 100.0).cos();
    corr += p[21] * (a / 10.0).sin() + p[22] * (a / 10.0).cos();
    corr += p[23] * (r / 300.0).tanh() + p[24] * (a / 5.0).tanh();
    corr += p[25] * r * (a / 10.0).sin() + p[26] * r * (a / 10.0).cos();
    corr += p[27] * r.sqrt() + p[28] * a.abs().sqrt();
    corr += p[29] * (-r / 150.0).exp() + p[30] * (-r / 100.0).exp();
    if r < 150.0 {
        corr += p[31] * (150.0 - r) / 150.0
            + p[32] * (PI * r / 150.0).sin()
            + p[33] * (PI * r / 150.0).cos()
            + p[34] * a * a
            + p[35] * r * a
            + p[36] * (-a.abs() / 3.0).exp()
            + p[37] * (r / 150.0 + 0.1).ln();
    }
    corr.clamp(-30.0, 30.0)
}

fn calculate_correction_high(p: &[f64; 20], r: f64, a: f64) -> f64 {
    let mut corr = 0.0;
    corr += p[0] * r + p[1] * a * a + p[2] * a.powi(3) + p[3] * r * r + p[4] * r * a;
    corr += p[5] * deg2rad(a).sin() + p[6] * deg2rad(a).cos();
    corr += p[7] * deg2rad(2.0 * a).sin() + p[8] * deg2rad(2.0 * a).cos();
    corr += p[9] * (-r / 100.0).exp() + p[10] * (-r / 200.0).exp() + p[11] * (-r / 300.0).exp();
    corr += p[12] * (-a.abs() / 5.0).exp()
        + p[13] * (-a.abs() / 10.0).exp()
        + p[14] * (-a.abs() / 15.0).exp();
    corr += p[15] * r * deg2rad(a / 10.0).sin() + p[16] * r * deg2rad(a / 10.0).cos();
    corr += p[17] * r.sqrt() * (a / 10.0).tanh();
    corr += p[18]
        * if a > 45.0 {
            ((a - 45.0) / 45.0).powi(2)
        } else {
            0.0
        }
        + p[19] * if r > 200.0 { (r - 200.0) / 100.0 } else { 0.0 };
    corr.clamp(-20.0, 20.0)
}

/// 根据水平距离 `r`(m) 与仰角 `alpha`(°) 计算低/高弧角度。
pub fn compute_theta(r: f64, alpha: f64) -> ThetaResult {
    let alpha_rad = deg2rad(alpha);
    let theta_low_orig = calculate_original_theta(r, alpha_rad, 20.0);
    let theta_high_orig = calculate_original_theta(r, alpha_rad, 60.0);
    let low_corr = calculate_correction_low(&LOW_PARAMS, r, alpha);
    let high_corr = calculate_correction_high(&HIGH_PARAMS, r, alpha);

    let mut theta_low = theta_low_orig + low_corr;
    let mut theta_high = theta_high_orig + high_corr;

    if theta_high_orig.is_nan() {
        theta_high = 90.0 - theta_low;
    }
    if theta_low_orig.is_nan() {
        theta_low = 90.0 - theta_high;
    }

    theta_low = constrain_theta(theta_low);
    theta_high = constrain_theta(theta_high);

    let out_of_range = theta_low.abs() > 90.0 || theta_high.abs() > 90.0;
    let (recommended_low, recommended_high) = if !out_of_range {
        (theta_low, theta_high - 2.0)
    } else {
        let low = if theta_low.abs() > 90.0 {
            90.0 - theta_high
        } else {
            theta_low
        };
        let high = if theta_high.abs() > 90.0 {
            90.0 - theta_low
        } else {
            theta_high
        };
        (low, high)
    };

    ThetaResult {
        r,
        alpha,
        theta_low_orig,
        theta_high_orig,
        theta_low,
        theta_high,
        recommended_low,
        recommended_high,
        out_of_range,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_height_mid_range_is_finite() {
        let r = compute_theta(100.0, 0.0);
        assert!(r.theta_low.is_finite());
        assert!(r.theta_high.is_finite());
        assert!(r.recommended_low.is_finite());
        assert!(r.recommended_high.is_finite());
        // 同高时低弧应明显小于高弧
        assert!(r.theta_low < r.theta_high);
    }

    #[test]
    fn elevated_target_changes_result() {
        let flat = compute_theta(120.0, 0.0);
        let up = compute_theta(120.0, 15.0);
        assert!((flat.theta_low - up.theta_low).abs() > 0.01);
    }

    #[test]
    fn constrain_keeps_in_range() {
        assert_eq!(constrain_theta(100.0), 90.0);
        assert_eq!(constrain_theta(-100.0), -90.0);
    }
}
