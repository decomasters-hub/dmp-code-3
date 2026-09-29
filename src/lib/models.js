// NOTE: There is intentionally no mock model shelf in this project.
// The live Electron path uses OpenCode `model.list` as the only source of
// truth. The dev browser has no models at all (empty shelf) rather than
// fake ones. This module is kept so existing imports keep working.
export const MODELS = [];

export function modelById() {
  return null;
}
