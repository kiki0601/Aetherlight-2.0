#[derive(Debug, Clone, Copy)]
pub enum ExportFormat {
    Jpeg,
    Png,
    Tiff,
}

#[derive(Debug, Clone, Copy)]
pub struct ExportSettings {
    pub format: ExportFormat,
    pub quality: u8,
    pub width: Option<u32>,
    pub height: Option<u32>,
}
