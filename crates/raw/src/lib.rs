use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawMetadata {
    pub make: Option<String>,
    pub model: Option<String>,
    pub orientation: Option<u16>,
    pub as_shot_temperature_kelvin: Option<f32>,
    pub as_shot_tint: Option<f32>,
}

#[derive(Debug, Error)]
pub enum RawError {
    #[error("RAW format is not supported yet: {0}")]
    UnsupportedFormat(String),
    #[error("RAW decoder error: {0}")]
    Decoder(String),
}

pub trait RawDecoder {
    fn open(&self, path: &str) -> Result<RawMetadata, RawError>;
}
