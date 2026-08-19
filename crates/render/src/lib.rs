#[derive(Debug, Clone, Copy)]
pub struct RenderGeneration(pub u64);

#[derive(Debug, Clone, Copy)]
pub struct RenderRequest {
    pub generation: RenderGeneration,
    pub viewport_width: u32,
    pub viewport_height: u32,
}

pub struct RenderEngine {
    generation: u64,
}

impl Default for RenderEngine {
    fn default() -> Self {
        Self { generation: 0 }
    }
}

impl RenderEngine {
    pub fn next_generation(&mut self) -> RenderGeneration {
        self.generation = self.generation.saturating_add(1);
        RenderGeneration(self.generation)
    }

    pub fn is_current(&self, generation: RenderGeneration) -> bool {
        generation.0 == self.generation
    }
}
