use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawDocument {
    pub id: Uuid,
    pub source_path: String,
    pub edits: EditState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EditState {
    pub exposure: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub whites: f32,
    pub blacks: f32,
    pub temperature_kelvin: Option<f32>,
    pub tint: f32,
    pub vibrance: f32,
    pub saturation: f32,
}

impl RawDocument {
    pub fn new(source_path: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            source_path: source_path.into(),
            edits: EditState::default(),
        }
    }
}
