import { expect, test } from 'bun:test';
import { createObservationClock } from './observation-clock';

test('elapsed browser time cannot extend validity after wall-clock rollback', () => {
 let wall = 1000, mono = 0;
 const clock = createObservationClock(() => wall, () => mono);
 expect(clock()).toBe(1000);
 mono = 100; wall = -59000;
 expect(clock()).toBe(1100);
 wall = 1000; mono = 200;
 expect(clock()).toBe(1200);
 wall = 7000; mono = 201;
 expect(clock()).toBe(7000);
 wall = 1000; mono = 202;
 expect(clock()).toBe(7001);
 mono = NaN; expect(Number.isFinite(clock())).toBe(false);
});
