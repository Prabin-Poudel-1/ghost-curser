import { randomId } from '../shared/security';
import type { Point } from '../shared/types';
import {
  LASER_BATCH_POINTS,
  MAX_LASER_POINTS,
  type FeatureMessage,
} from '../networking/collaboration-protocol';
// One bounded batch every 100 ms; render local feedback immediately, send compact points.
export class LaserSampler {
  private stroke: string | undefined;
  private points: Point[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private count = 0;
  constructor(
    private send: (message: FeatureMessage) => void,
    private next: () => number,
  ) {}
  start(point: Point) {
    this.end();
    this.stroke = randomId();
    this.count = 1;
    this.send({
      v: 2,
      t: 'laser_start',
      stroke: this.stroke,
      seq: this.next(),
      ...point,
    });
  }
  move(point: Point) {
    if (!this.stroke || this.count >= MAX_LASER_POINTS) return;
    this.count++;
    if (this.points.length < LASER_BATCH_POINTS) this.points.push(point);
    else this.points[this.points.length - 1] = point;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 100);
  }
  private flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.stroke && this.points.length)
      this.send({
        v: 2,
        t: 'laser_move',
        stroke: this.stroke,
        seq: this.next(),
        points: this.points.splice(0),
      });
  }
  end() {
    if (!this.stroke) return;
    this.flush();
    this.send({ v: 2, t: 'laser_end', stroke: this.stroke, seq: this.next() });
    this.stroke = undefined;
  }
  clear() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.points = [];
    this.stroke = undefined;
  }
  destroy() {
    this.clear();
  }
}
