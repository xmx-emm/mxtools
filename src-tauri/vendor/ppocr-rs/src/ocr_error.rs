use thiserror::Error;

#[derive(Error, Debug)]
pub enum OcrError {
    #[error("Ort error")]
    Ort(#[from] ort::Error),
    #[error("Io error")]
    Io(#[from] std::io::Error),
    #[error("Session not initialized")]
    ImageError(#[from] image::ImageError),
    #[error("Image error")]
    SessionNotInitialized,
    /// Errore nella shape o nei nomi degli input ONNX (modello incompatibile).
    #[error("Model input error: {0}")]
    ModelInput(String),
    /// Errore nella shape o decodifica dell'output ONNX.
    #[error("Model output error: {0}")]
    ModelOutput(String),
    /// Errore download / cache modelli (model_hub).
    #[error("Model hub error: {0}")]
    ModelHubError(String),
}
