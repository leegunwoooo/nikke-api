import { AnimationState, AnimationStateData, MeshAttachment, RegionAttachment, Skeleton, type SkeletonData } from "@esotericsoftware/spine-core";
import type { BurstPlayback } from "../src/types.js";

/** One playback operation for the whole cutscene. Poses must remain independent:
 * background animations explicitly hide character slots and vice versa. */
export class BurstScene {
  readonly layers: { skeleton: Skeleton; state: AnimationState; animation: string; role: "background" | "main" | "overlay"; transform?: [number, number, number] }[];
  readonly duration: number;

  constructor(data: SkeletonData, playback: BurstPlayback) {
    this.duration = playback.duration;
    this.layers = playback.layers.map(layer => {
      if (!data.findAnimation(layer.animation)) throw new Error(`Missing animation: ${layer.animation}`);
      const skeleton = new Skeleton(data);
      // Some skeletons keep all attachments in a named skin (e.g. "00"), not
      // the default skin — without it every slot stays empty.
      if (skeleton.drawOrder.every(slot => !slot.attachment) && data.skins.length) {
        for (const skin of data.skins) skeleton.setSkin(skin);
      }
      return { skeleton, state: new AnimationState(new AnimationStateData(data)), animation: layer.animation, role: layer.role, transform: layer.transform };
    });
    this.seek(0);
  }

  seek(time: number) {
    const t = Math.max(0, Math.min(this.duration, time));
    for (const layer of this.layers) {
      layer.skeleton.setToSetupPose();
      layer.state.clearTracks();
      const track = layer.state.setAnimation(0, layer.animation, false);
      track.trackTime = t;
      layer.state.apply(layer.skeleton);
      // Catalog composite transforms position reused-skeleton layers
      // (ArtHub previewTransform = [x, y, scale] in skeleton space).
      if (layer.transform) {
        layer.skeleton.x = layer.transform[0];
        layer.skeleton.y = layer.transform[1];
        layer.skeleton.scaleX = layer.transform[2];
        layer.skeleton.scaleY = layer.transform[2];
      }
      layer.skeleton.updateWorldTransform();
    }
  }

  /** Fit the main scene, so a large backdrop does not shrink the character. */
  bounds() {
    const skeleton = (this.layers.find(l => l.role === "main") ?? this.layers[this.layers.length - 1]).skeleton;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const vertices: number[] = [];
    for (const slot of skeleton.drawOrder) {
      const a = slot.attachment;
      if (!slot.bone.active || slot.color.a < 0.001 || !(a instanceof RegionAttachment || a instanceof MeshAttachment) || a.color.a < 0.001) continue;
      const length = a instanceof RegionAttachment ? 8 : a.worldVerticesLength;
      vertices.length = length;
      if (a instanceof RegionAttachment) a.computeWorldVertices(slot, vertices, 0, 2);
      else a.computeWorldVertices(slot, 0, length, vertices, 0, 2);
      for (let i = 0; i < length; i += 2) {
        minX = Math.min(minX, vertices[i]); maxX = Math.max(maxX, vertices[i]);
        minY = Math.min(minY, vertices[i + 1]); maxY = Math.max(maxY, vertices[i + 1]);
      }
    }
    return { minX, minY, maxX, maxY };
  }
}
