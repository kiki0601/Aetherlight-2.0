use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MaskKind {
    Brush,
    Linear,
    Radial,
    Luminance,
    ColorRange,
    Subject,
    Sky,
    Background,
    People,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mask {
    pub id: u64,
    pub kind: MaskKind,
    pub feather: f32,
    pub density: f32,
    pub inverted: bool,
}
