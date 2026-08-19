# Aetherlight 2.0

A clean, GPU-first RAW photo editor architecture for Windows, designed from the ground up for CR3, ARW, RAF and other camera RAW formats.

## Architecture

- `apps/desktop`: Tauri desktop shell and React UI
- `crates/core`: non-destructive edit model and document state
- `crates/raw`: RAW decoding and camera metadata boundary
- `crates/render`: WGPU render graph and GPU shader pipeline
- `crates/masks`: mask geometry, rasterization and future AI-mask boundary
- `crates/catalog`: library, thumbnails, metadata and collections
- `crates/export`: export pipeline
- `tests`: deterministic image-processing and document-model tests

## Principles

1. UI never owns image-processing logic.
2. RAW documents remain immutable.
3. Editing is a non-destructive parameter graph.
4. Interactive previews use a dedicated low-resolution render path.
5. Full-resolution rendering is separate from interaction.
6. Render jobs are cancellable and generation-tagged.
7. GPU resources are owned by the render engine, not the UI.
8. Every user-visible adjustment has a typed numeric value model.
9. Camera orientation and white balance come from RAW metadata/coefficients, not UI guesses.
10. CI must build and test the workspace before feature work is accepted.
