use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogPhoto {
    pub id: Uuid,
    pub path: String,
    pub rating: u8,
    pub flagged: bool,
    pub label: Option<String>,
    pub keywords: Vec<String>,
}

impl CatalogPhoto {
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            path: path.into(),
            rating: 0,
            flagged: false,
            label: None,
            keywords: Vec::new(),
        }
    }
}
