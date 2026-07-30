/**
 * @fileoverview visibility-polygon.js - 2D Line-of-Sight Visibility Polygon Computational Library
 * 
 * @description
 * High-performance 2D computational geometry module implementing an O(N log N) angular sweep-line
 * algorithm with a binary min-heap to generate visibility polygons around an observer point given a set
 * of non-intersecting line segments.
 * 
 * Original source code by Byron Knoll (@byronknoll) on https://github.com/byronknoll/visibility-polygon-js
 * TypeScript support & ESM re-implementation by Liang Chun Wong (@lwong)
 * Re-architected & performance-hardened for TastyTails.net.
 * 
 * Triggered by:
 * - Client frame loop: scene.update() -> ShadowSystem.updatePlayerShadows() (60 FPS tick)
 * - Server tick loop: server-loop.js visibility polygon computation
 */

// OPTIMIZATION: Pre-allocated static 2D coordinate buffers for min-heap lessThan comparisons.
// Prevents thousands of temporary array allocations per second during 60 FPS sweep-line execution.
const _interBuffer1 = [0, 0];
const _interBuffer2 = [0, 0];

/**
 * Computes a 2D visibility polygon around an observer position.
 * Time Complexity: O(N log N) where N is the number of line segments.
 * 
 * @param {Array<number>} position - Observer position [x, y].
 * @param {Array<Array<Array<number>>>} segments - Array of line segments [[[x1, y1], [x2, y2]], ...].
 * @returns {Array<Array<number>>} Visibility polygon vertices in clockwise order.
 */
function compute(position, segments) {
  const bounded = [];
  let minX = position[0];
  let minY = position[1];
  let maxX = position[0];
  let maxY = position[1];

  for (let i = 0; i < segments.length; ++i) {
    for (let j = 0; j < 2; ++j) {
      minX = Math.min(minX, segments[i][j][0]);
      minY = Math.min(minY, segments[i][j][1]);
      maxX = Math.max(maxX, segments[i][j][0]);
      maxY = Math.max(maxY, segments[i][j][1]);
    }

    bounded.push([[segments[i][0][0], segments[i][0][1]], [segments[i][1][0], segments[i][1][1]]]);
  }

  --minX;
  --minY;
  ++maxX;
  ++maxY;
  bounded.push([[minX, minY], [maxX, minY]]);
  bounded.push([[maxX, minY], [maxX, maxY]]);
  bounded.push([[maxX, maxY], [minX, maxY]]);
  bounded.push([[minX, maxY], [minX, minY]]);

  const polygon = [];
  const sorted = sortPoints(position, bounded);
  const map = new Array(bounded.length);

  for (let i = 0; i < map.length; ++i) {
    map[i] = -1;
  }

  const heap = [];
  const start = [position[0] + 1, position[1]];

  for (let i = 0; i < bounded.length; ++i) {
    const a1 = angle(bounded[i][0], position);
    const a2 = angle(bounded[i][1], position);
    let active = false;
    if (a1 > -180 && a1 <= 0 && a2 <= 180 && a2 >= 0 && a2 - a1 > 180) active = true;
    if (a2 > -180 && a2 <= 0 && a1 <= 180 && a1 >= 0 && a1 - a2 > 180) active = true;

    if (active) {
      insert(i, heap, position, bounded, start, map);
    }
  }

  let i = 0;
  while (i < sorted.length) {
    let extend = false;
    let shorten = false;
    const orig = i;
    let vertex = bounded[sorted[i][0]][sorted[i][1]];
    const old_segment = heap[0];

    do {
      if (map[sorted[i][0]] !== -1) {
        if (sorted[i][0] === old_segment) {
          extend = true;
          vertex = bounded[sorted[i][0]][sorted[i][1]];
        }

        remove(map[sorted[i][0]], heap, position, bounded, vertex, map);
      } else {
        insert(sorted[i][0], heap, position, bounded, vertex, map);

        if (heap[0] !== old_segment) {
          shorten = true;
        }
      }

      ++i;
      if (i === sorted.length) break;
    } while (sorted[i][2] < sorted[orig][2] + epsilon());

    if (extend) {
      polygon.push(vertex);
      const cur = intersectLines(bounded[heap[0]][0], bounded[heap[0]][1], position, vertex);
      if (cur && !equal(cur, vertex)) polygon.push(cur);
    } else if (shorten) {
      const curOld = intersectLines(bounded[old_segment][0], bounded[old_segment][1], position, vertex);
      const curHeap = intersectLines(bounded[heap[0]][0], bounded[heap[0]][1], position, vertex);
      if (curOld) polygon.push(curOld);
      if (curHeap) polygon.push(curHeap);
    }
  }

  return polygon;
}

/**
 * Computes a visibility polygon within the specified rectangular viewport.
 * 
 * @param {Array<number>} position - Observer position [x, y].
 * @param {Array<Array<Array<number>>>} segments - Line segments.
 * @param {Array<number>} viewportMinCorner - Viewport minimum corner [minX, minY].
 * @param {Array<number>} viewportMaxCorner - Viewport maximum corner [maxX, maxY].
 * @returns {Array<Array<number>>} Clockwise vertex list of visibility polygon clipped to viewport.
 */
function computeViewport(position, segments, viewportMinCorner, viewportMaxCorner) {
  const brokenSegments = [];
  const viewport = [
    [viewportMinCorner[0], viewportMinCorner[1]],
    [viewportMaxCorner[0], viewportMinCorner[1]],
    [viewportMaxCorner[0], viewportMaxCorner[1]],
    [viewportMinCorner[0], viewportMaxCorner[1]]
  ];

  for (let i = 0; i < segments.length; ++i) {
    if (segments[i][0][0] < viewportMinCorner[0] && segments[i][1][0] < viewportMinCorner[0]) continue;
    if (segments[i][0][1] < viewportMinCorner[1] && segments[i][1][1] < viewportMinCorner[1]) continue;
    if (segments[i][0][0] > viewportMaxCorner[0] && segments[i][1][0] > viewportMaxCorner[0]) continue;
    if (segments[i][0][1] > viewportMaxCorner[1] && segments[i][1][1] > viewportMaxCorner[1]) continue;
    const intersections = [];

    for (let j = 0; j < viewport.length; ++j) {
      let k = j + 1;
      if (k === viewport.length) k = 0;

      if (doLineSegmentsIntersect(segments[i][0][0], segments[i][0][1], segments[i][1][0], segments[i][1][1], viewport[j][0], viewport[j][1], viewport[k][0], viewport[k][1])) {
        const intersect = intersectLines(segments[i][0], segments[i][1], viewport[j], viewport[k]);
        if (!intersect || intersect.length !== 2) continue;
        if (equal(intersect, segments[i][0]) || equal(intersect, segments[i][1])) continue;
        intersections.push(intersect);
      }
    }

    const start = [segments[i][0][0], segments[i][0][1]];

    while (intersections.length > 0) {
      let endIndex = 0;
      let endDis = distance(start, intersections[0]);

      for (let j = 1; j < intersections.length; ++j) {
        const dis = distance(start, intersections[j]);

        if (dis < endDis) {
          endDis = dis;
          endIndex = j;
        }
      }

      brokenSegments.push([[start[0], start[1]], [intersections[endIndex][0], intersections[endIndex][1]]]);
      start[0] = intersections[endIndex][0];
      start[1] = intersections[endIndex][1];
      // OPTIMIZATION: Replaced Array.splice with O(1) swap-and-pop
      intersections[endIndex] = intersections[intersections.length - 1];
      intersections.pop();
    }

    brokenSegments.push([start, [segments[i][1][0], segments[i][1][1]]]);
  }

  const viewportSegments = [];

  for (let i = 0; i < brokenSegments.length; ++i) {
    if (inViewport(brokenSegments[i][0], viewportMinCorner, viewportMaxCorner) && inViewport(brokenSegments[i][1], viewportMinCorner, viewportMaxCorner)) {
      viewportSegments.push([[brokenSegments[i][0][0], brokenSegments[i][0][1]], [brokenSegments[i][1][0], brokenSegments[i][1][1]]]);
    }
  }

  const eps = epsilon() * 10;
  viewportSegments.push([[viewportMinCorner[0] - eps, viewportMinCorner[1] - eps], [viewportMaxCorner[0] + eps, viewportMinCorner[1] - eps]]);
  viewportSegments.push([[viewportMaxCorner[0] + eps, viewportMinCorner[1] - eps], [viewportMaxCorner[0] + eps, viewportMaxCorner[1] + eps]]);
  viewportSegments.push([[viewportMaxCorner[0] + eps, viewportMaxCorner[1] + eps], [viewportMinCorner[0] - eps, viewportMaxCorner[1] + eps]]);
  viewportSegments.push([[viewportMinCorner[0] - eps, viewportMaxCorner[1] + eps], [viewportMinCorner[0] - eps, viewportMinCorner[1] - eps]]);
  return compute(position, viewportSegments);
}

/**
 * Checks if a point lies within a viewport bounding box.
 * 
 * @param {Array<number>} position - Point coordinates [x, y].
 * @param {Array<number>} viewportMinCorner - Minimum viewport corner [minX, minY].
 * @param {Array<number>} viewportMaxCorner - Maximum viewport corner [maxX, maxY].
 * @returns {boolean} True if point is within viewport bounds.
 */
function inViewport(position, viewportMinCorner, viewportMaxCorner) {
  if (position[0] < viewportMinCorner[0] - epsilon()) return false;
  if (position[1] < viewportMinCorner[1] - epsilon()) return false;
  if (position[0] > viewportMaxCorner[0] + epsilon()) return false;
  if (position[1] > viewportMaxCorner[1] + epsilon()) return false;
  return true;
}

/**
 * Determines whether a 2D point lies inside a polygon using ray-casting parity checks.
 * Time Complexity: O(N) where N is the number of points in the polygon.
 * 
 * @param {Array<number>} position - Point coordinates [x, y].
 * @param {Array<Array<number>>} polygon - Polygon vertex array.
 * @returns {boolean} True if position is inside polygon.
 */
function inPolygon(position, polygon) {
  // SAFETY: Guard against null/empty polygon inputs to prevent TypeError
  if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  let val = polygon[0][0];

  for (let i = 0; i < polygon.length; ++i) {
    val = Math.min(polygon[i][0], val);
    val = Math.min(polygon[i][1], val);
  }

  const edge = [val - 1, val - 1];
  let parity = 0;

  for (let i = 0; i < polygon.length; ++i) {
    let j = i + 1;
    if (j === polygon.length) j = 0;

    if (doLineSegmentsIntersect(edge[0], edge[1], position[0], position[1], polygon[i][0], polygon[i][1], polygon[j][0], polygon[j][1])) {
      const intersect = intersectLines(edge, position, polygon[i], polygon[j]);
      if (!intersect) continue;
      if (equal(position, intersect)) return true;

      if (equal(intersect, polygon[i])) {
        if (angle2(position, edge, polygon[j]) < 180) ++parity;
      } else if (equal(intersect, polygon[j])) {
        if (angle2(position, edge, polygon[i]) < 180) ++parity;
      } else {
        ++parity;
      }
    }
  }

  return parity % 2 !== 0;
}

/**
 * Converts a list of polygons into a line segment array.
 * 
 * @param {Array<Array<Array<number>>>} polygons - Array of polygon vertex lists.
 * @returns {Array<Array<Array<number>>>} List of line segments.
 */
function convertToSegments(polygons) {
  const segments = [];

  for (let i = 0; i < polygons.length; ++i) {
    for (let j = 0; j < polygons[i].length; ++j) {
      let k = j + 1;
      if (k === polygons[i].length) k = 0;
      segments.push([[polygons[i][j][0], polygons[i][j][1]], [polygons[i][k][0], polygons[i][k][1]]]);
    }
  }

  return segments;
}

/**
 * Pre-processes line segments to split intersecting segments at intersection points.
 * Time Complexity: O(N^2) where N is segment count.
 * 
 * @param {Array<Array<Array<number>>>} segments - Raw line segments.
 * @returns {Array<Array<Array<number>>>} Segments with intersections broken.
 */
function breakIntersections(segments) {
  const output = [];

  for (let i = 0; i < segments.length; ++i) {
    const intersections = [];

    for (let j = 0; j < segments.length; ++j) {
      if (i === j) continue;

      if (doLineSegmentsIntersect(segments[i][0][0], segments[i][0][1], segments[i][1][0], segments[i][1][1], segments[j][0][0], segments[j][0][1], segments[j][1][0], segments[j][1][1])) {
        const intersect = intersectLines(segments[i][0], segments[i][1], segments[j][0], segments[j][1]);
        if (!intersect || intersect.length !== 2) continue;
        if (equal(intersect, segments[i][0]) || equal(intersect, segments[i][1])) continue;
        intersections.push(intersect);
      }
    }

    const start = [segments[i][0][0], segments[i][0][1]];

    while (intersections.length > 0) {
      let endIndex = 0;
      let endDis = distance(start, intersections[0]);

      for (let j = 1; j < intersections.length; ++j) {
        const dis = distance(start, intersections[j]);

        if (dis < endDis) {
          endDis = dis;
          endIndex = j;
        }
      }

      output.push([[start[0], start[1]], [intersections[endIndex][0], intersections[endIndex][1]]]);
      start[0] = intersections[endIndex][0];
      start[1] = intersections[endIndex][1];
      // OPTIMIZATION: Replaced Array.splice with O(1) swap-and-pop
      intersections[endIndex] = intersections[intersections.length - 1];
      intersections.pop();
    }

    output.push([start, [segments[i][1][0], segments[i][1][1]]]);
  }

  return output;
}

/**
 * Returns floating-point numerical tolerance epsilon.
 * @returns {number} Epsilon value (1e-7).
 */
function epsilon() {
  return 0.0000001;
}

/**
 * Compares two 2D points for equality within epsilon tolerance.
 * 
 * @param {Array<number>} a - First point [x, y].
 * @param {Array<number>} b - Second point [x, y].
 * @returns {boolean} True if points are equal within epsilon tolerance.
 */
function equal(a, b) {
  if (!a || !b) return false;
  if (Math.abs(a[0] - b[0]) < epsilon() && Math.abs(a[1] - b[1]) < epsilon()) return true;
  return false;
}

/**
 * Removes a segment index from the active segment binary min-heap.
 * 
 * @param {number} index - Index in heap to remove.
 * @param {Array<number>} heap - Min-heap array of segment indices.
 * @param {Array<number>} position - Observer position.
 * @param {Array<Array<Array<number>>>} segments - Segment array.
 * @param {Array<number>} destination - Ray endpoint destination.
 * @param {Array<number>} map - Segment index map.
 */
function remove(index, heap, position, segments, destination, map) {
  map[heap[index]] = -1;

  if (index === heap.length - 1) {
    heap.pop();
    return;
  }

  heap[index] = heap.pop();
  map[heap[index]] = index;
  let cur = index;
  const parent1 = parent(cur);

  if (cur !== 0 && lessThan(heap[cur], heap[parent1], position, segments, destination)) {
    while (cur > 0) {
      const parent2 = parent(cur);

      if (!lessThan(heap[cur], heap[parent2], position, segments, destination)) {
        break;
      }

      map[heap[parent2]] = cur;
      map[heap[cur]] = parent2;
      const temp = heap[cur];
      heap[cur] = heap[parent2];
      heap[parent2] = temp;
      cur = parent2;
    }
  } else {
    while (true) {
      const left = child(cur);
      const right = left + 1;

      if (left < heap.length && lessThan(heap[left], heap[cur], position, segments, destination) && (right === heap.length || lessThan(heap[left], heap[right], position, segments, destination))) {
        map[heap[left]] = cur;
        map[heap[cur]] = left;
        const temp = heap[left];
        heap[left] = heap[cur];
        heap[cur] = temp;
        cur = left;
      } else if (right < heap.length && lessThan(heap[right], heap[cur], position, segments, destination)) {
        map[heap[right]] = cur;
        map[heap[cur]] = right;
        const temp = heap[right];
        heap[right] = heap[cur];
        heap[cur] = temp;
        cur = right;
      } else break;
    }
  }
}

/**
 * Inserts a segment index into the active segment binary min-heap.
 * 
 * @param {number} index - Segment index to insert.
 * @param {Array<number>} heap - Min-heap array.
 * @param {Array<number>} position - Observer position.
 * @param {Array<Array<Array<number>>>} segments - Segment array.
 * @param {Array<number>} destination - Ray endpoint destination.
 * @param {Array<number>} map - Segment index map.
 */
function insert(index, heap, position, segments, destination, map) {
  const intersect = intersectLines(segments[index][0], segments[index][1], position, destination);
  if (!intersect || intersect.length === 0) return;
  let cur = heap.length;
  heap.push(index);
  map[index] = cur;

  while (cur > 0) {
    const parent1 = parent(cur);

    if (!lessThan(heap[cur], heap[parent1], position, segments, destination)) {
      break;
    }

    map[heap[parent1]] = cur;
    map[heap[cur]] = parent1;
    const temp = heap[cur];
    heap[cur] = heap[parent1];
    heap[parent1] = temp;
    cur = parent1;
  }
}

/**
 * Heap ordering comparison function: determines if segment index1 is closer to position than index2 along ray.
 * 
 * @param {number} index1 - First segment index.
 * @param {number} index2 - Second segment index.
 * @param {Array<number>} position - Observer position.
 * @param {Array<Array<Array<number>>>} segments - Segment list.
 * @param {Array<number>} destination - Ray endpoint.
 * @returns {boolean} True if index1 is closer than index2.
 */
function lessThan(index1, index2, position, segments, destination) {
  // OPTIMIZATION: Pass pre-allocated scratch buffers to intersectLines to avoid hot-loop GC pressure
  const inter1 = intersectLines(segments[index1][0], segments[index1][1], position, destination, _interBuffer1);
  const inter2 = intersectLines(segments[index2][0], segments[index2][1], position, destination, _interBuffer2);

  // SAFETY: Guard against parallel ray lines returning null
  if (!inter1 || !inter2) return false;

  if (!equal(inter1, inter2)) {
    const d1 = distance(inter1, position);
    const d2 = distance(inter2, position);
    return d1 < d2;
  }

  let end1 = 0;
  if (equal(inter1, segments[index1][0])) end1 = 1;
  let end2 = 0;
  if (equal(inter2, segments[index2][0])) end2 = 1;
  const a1 = angle2(segments[index1][end1], inter1, position);
  const a2 = angle2(segments[index2][end2], inter2, position);

  if (a1 < 180) {
    if (a2 > 180) return true;
    return a2 < a1;
  }

  return a1 < a2;
}

/**
 * Parent node index in binary min-heap.
 * @param {number} index - Current node index.
 * @returns {number} Parent node index.
 */
function parent(index) {
  return Math.floor((index - 1) / 2);
}

/**
 * Left child node index in binary min-heap.
 * @param {number} index - Current node index.
 * @returns {number} Child node index.
 */
function child(index) {
  return 2 * index + 1;
}

/**
 * Calculates the interior angle between three 2D points.
 * 
 * @param {Array<number>} a - First point.
 * @param {Array<number>} b - Vertex point.
 * @param {Array<number>} c - Third point.
 * @returns {number} Angle in degrees [0, 360).
 */
function angle2(a, b, c) {
  const a1 = angle(a, b);
  const a2 = angle(b, c);
  let a3 = a1 - a2;
  if (a3 < 0) a3 += 360;
  if (a3 > 360) a3 -= 360;
  return a3;
}

/**
 * Sorts all segment endpoints by polar angle relative to position.
 * Time Complexity: O(N log N).
 * 
 * @param {Array<number>} position - Observer position.
 * @param {Array<Array<Array<number>>>} segments - Segment list.
 * @returns {Array<Array<number>>} Sorted points array [[segmentIndex, pointIndex, polarAngle], ...].
 */
function sortPoints(position, segments) {
  const points = new Array(segments.length * 2);

  for (let i = 0; i < segments.length; ++i) {
    for (let j = 0; j < 2; ++j) {
      const a = angle(segments[i][j], position);
      points[2 * i + j] = [i, j, a];
    }
  }

  points.sort(function (a, b) {
    return a[2] - b[2];
  });
  return points;
}

/**
 * Calculates the polar angle from point b to point a in degrees.
 * 
 * @param {Array<number>} a - Target point.
 * @param {Array<number>} b - Center point.
 * @returns {number} Angle in degrees [-180, 180].
 */
function angle(a, b) {
  return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
}

/**
 * Computes 2D line segment intersection coordinates.
 * 
 * @param {Array<number>} a1 - Line A start [x, y].
 * @param {Array<number>} a2 - Line A end [x, y].
 * @param {Array<number>} b1 - Line B start [x, y].
 * @param {Array<number>} b2 - Line B end [x, y].
 * @param {Array<number>} [out] - Optional destination 2D array [x, y] to store coordinates.
 * @returns {Array<number>|null} Intersection coordinates [x, y] or null if parallel.
 */
function intersectLines(a1, a2, b1, b2, out) {
  const dbx = b2[0] - b1[0];
  const dby = b2[1] - b1[1];
  const dax = a2[0] - a1[0];
  const day = a2[1] - a1[1];
  const u_b = dby * dax - dbx * day;

  if (u_b !== 0) {
    const ua = (dbx * (a1[1] - b1[1]) - dby * (a1[0] - b1[0])) / u_b;
    const x = a1[0] + ua * dax;
    const y = a1[1] + ua * day;
    if (out) {
      out[0] = x;
      out[1] = y;
      return out;
    }
    return [x, y];
  }

  return null;
}

/**
 * Calculates squared Euclidean distance between two points.
 * 
 * @param {Array<number>} a - Point A [x, y].
 * @param {Array<number>} b - Point B [x, y].
 * @returns {number} Squared distance (dx^2 + dy^2).
 */
function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * Checks if point (xk, yk) lies within the bounding box defined by (xi, yi) and (xj, yj).
 */
function isOnSegment(xi, yi, xj, yj, xk, yk) {
  return (xi <= xk || xj <= xk) && (xk <= xi || xk <= xj) && (yi <= yk || yj <= yk) && (yk <= yi || yk <= yj);
}

/**
 * Computes 2D cross-product orientation direction of point k relative to line segment ij.
 * @returns {number} -1 for counter-clockwise, 1 for clockwise, 0 for collinear.
 */
function computeDirection(xi, yi, xj, yj, xk, yk) {
  const a = (xk - xi) * (yj - yi);
  const b = (xj - xi) * (yk - yi);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Tests whether two 2D line segments intersect.
 * 
 * @returns {boolean} True if line segments intersect.
 */
function doLineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = computeDirection(x3, y3, x4, y4, x1, y1);
  const d2 = computeDirection(x3, y3, x4, y4, x2, y2);
  const d3 = computeDirection(x1, y1, x2, y2, x3, y3);
  const d4 = computeDirection(x1, y1, x2, y2, x4, y4);
  return (d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0) || d1 === 0 && isOnSegment(x3, y3, x4, y4, x1, y1) || d2 === 0 && isOnSegment(x3, y3, x4, y4, x2, y2) || d3 === 0 && isOnSegment(x1, y1, x2, y2, x3, y3) || d4 === 0 && isOnSegment(x1, y1, x2, y2, x4, y4);
}

export { breakIntersections, compute, computeViewport, convertToSegments, inPolygon, inViewport };
