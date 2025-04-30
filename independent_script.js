const fs = require('fs');
const path = require('path');

// Paths
const inputFilePath = path.join(__dirname, 'output_bunny_split.json');   // change 'input.json' to your input file
const outputFilePath = path.join(__dirname, 'output_bunny_split_lod_reduced.json'); // change 'output.json' as needed

// Read JSON file
fs.readFile(inputFilePath, 'utf8', (err, data) => {
  if (err) {
      console.error('Error reading input JSON file:', err);
      return;
  }

  try {
      const jsonData = JSON.parse(data);
      // Process JSON
      // const processedData = simplifyMesh(jsonData, 0.1);
      let i = 0;
      let resultData = jsonData.map((json) => {console.log(`iteration ${i}`); i++; return simplifyMesh(json, 0.1); });

      // Save modified JSON
      fs.writeFile(outputFilePath, JSON.stringify(resultData, null, 2), 'utf8', err => {
          if (err) {
              console.error('Error writing output JSON file:', err);
          } else {
              console.log('JSON processed and saved successfully to', outputFilePath);
          }
      });
  } catch (parseErr) {
      console.error('Error parsing JSON:', parseErr);
  }
});

class Quadric {
  constructor(a = 0, b = 0, c = 0, d = 0) {
    this.a = a; this.b = b; this.c = c; this.d = d;
    // Quadric matrix (4x4 symmetric, stored as 10 floats)
    this.matrix = new Float32Array(10).fill(0);
  }

  // Compute quadric for a plane (ax + by + cz + d = 0)
  static fromPlane(a, b, c, d) {
    const q = new Quadric();
    q.matrix[0] = a * a; q.matrix[1] = a * b; q.matrix[2] = a * c; q.matrix[3] = a * d;
    q.matrix[4] = b * b; q.matrix[5] = b * c; q.matrix[6] = b * d;
    q.matrix[7] = c * c; q.matrix[8] = c * d;
    q.matrix[9] = d * d;
    return q;
  }

  // Add two quadrics
  add(other) {
    for (let i = 0; i < 10; i++) this.matrix[i] += other.matrix[i];
  }

  // Compute error for a vertex (vx, vy, vz)
  error(vx, vy, vz) {
    const m = this.matrix;
    return (
      vx * vx * m[0] + 2 * vx * vy * m[1] + 2 * vx * vz * m[2] + 2 * vx * m[3] +
      vy * vy * m[4] + 2 * vy * vz * m[5] + 2 * vy * m[6] +
      vz * vz * m[7] + 2 * vz * m[8] +
      m[9]
    );
  }
}

function simplifyMesh(model, targetRatio) {
  const {vertices, triangles, normals, uvs, tangents, bitangents} = model;
  // 1. Compute quadrics for each vertex
  const quadrics = new Array(vertices.length);
  for (let i = 0; i < vertices.length; i++) quadrics[i] = new Quadric();

  // Compute face normals and accumulate quadrics
  for (const tri of triangles) {
    const [i0, i1, i2] = tri;
    const v0 = vertices[i0], v1 = vertices[i1], v2 = vertices[i2];

    // Compute face normal
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const normal = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]
    ];
    const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    if (length > 0) {
      normal[0] /= length; normal[1] /= length; normal[2] /= length;
    }

    // Plane equation: ax + by + cz + d = 0
    const d = -(normal[0] * v0[0] + normal[1] * v0[1] + normal[2] * v0[2]);
    const faceQuadric = Quadric.fromPlane(normal[0], normal[1], normal[2], d);

    // Accumulate quadrics for each vertex in the face
    quadrics[i0].add(faceQuadric);
    quadrics[i1].add(faceQuadric);
    quadrics[i2].add(faceQuadric);
  }

  // 2. Rank edges by collapse cost
  const edges = [];
  for (const tri of triangles) {
    edges.push([tri[0], tri[1]]);
    edges.push([tri[1], tri[2]]);
    edges.push([tri[2], tri[0]]);
  }

  // 2. Rank edges by collapse cost (same as before)
  const edgeCosts = edges.map(([i, j]) => {
    const q = new Quadric();
    q.add(quadrics[i]); q.add(quadrics[j]);
    const error = q.error(...vertices[j]);
    return { i, j, error };
  });
  edgeCosts.sort((a, b) => a.error - b.error);

  // 3. Track vertex merges (NEW)
  const vertexMap = new Array(vertices.length);
  for (let i = 0; i < vertices.length; i++) vertexMap[i] = i; // Initially, no remapping

  const simplifiedVertices = [...vertices];
  const simplifiedNormals = [...normals];
  const simplifiedUVs = [...uvs];
  const simplifiedTangents = [...tangents];
  const simplifiedBitangents = [...bitangents];
  let simplifiedTriangles = [...triangles];
  const removed = new Set();

  const targetFaces = Math.floor(triangles.length * targetRatio);
  while (simplifiedTriangles.length > targetFaces && edgeCosts.length > 0) {
    const { i, j, error } = edgeCosts.shift();
    if (removed.has(i) || removed.has(j)) continue;

    // Merge vertex `j` into `i`
    vertexMap[j] = i;
    removed.add(j);

    // Average attributes (optional: could also pick one)
    simplifiedVertices[i] = [
      (simplifiedVertices[i][0] + simplifiedVertices[j][0]) / 2,
      (simplifiedVertices[i][1] + simplifiedVertices[j][1]) / 2,
      (simplifiedVertices[i][2] + simplifiedVertices[j][2]) / 2
    ];
    simplifiedNormals[i] = [
      (simplifiedNormals[i][0] + simplifiedNormals[j][0]) / 2,
      (simplifiedNormals[i][1] + simplifiedNormals[j][1]) / 2,
      (simplifiedNormals[i][2] + simplifiedNormals[j][2]) / 2
    ];
    simplifiedUVs[i] = [
      (simplifiedUVs[i][0] + simplifiedUVs[j][0]) / 2,
      (simplifiedUVs[i][1] + simplifiedUVs[j][1]) / 2
    ];
    simplifiedTangents[i] = [
      (simplifiedTangents[i][0] + simplifiedTangents[j][0]) / 2,
      (simplifiedTangents[i][1] + simplifiedTangents[j][1]) / 2,
      (simplifiedTangents[i][2] + simplifiedTangents[j][2]) / 2
    ];
    simplifiedBitangents[i] = [
      (simplifiedBitangents[i][0] + simplifiedBitangents[j][0]) / 2,
      (simplifiedBitangents[i][1] + simplifiedBitangents[j][1]) / 2,
      (simplifiedBitangents[i][2] + simplifiedBitangents[j][2]) / 2
    ];

    // Update triangles to use `i` instead of `j`
    for (const tri of simplifiedTriangles) {
      if (tri[0] === j) tri[0] = i;
      if (tri[1] === j) tri[1] = i;
      if (tri[2] === j) tri[2] = i;
    }

    // Remove degenerate triangles
    simplifiedTriangles = simplifiedTriangles.filter(
      ([a, b, c]) => a !== b && b !== c && c !== a
    );
  }

  // 4. Reindex all attributes (NEW)
  const newIndices = new Array(vertices.length).fill(-1);
  let newVertexCount = 0;
  const finalVertices = [];
  const finalNormals = [];
  const finalUVs = [];
  const finalTangents = [];
  const finalBitangents = [];

  for (let i = 0; i < simplifiedTriangles.length; i++) {
    for (let k = 0; k < 3; k++) {
      const oldIndex = simplifiedTriangles[i][k];
      if (newIndices[oldIndex] === -1) {
        newIndices[oldIndex] = newVertexCount++;
        finalVertices.push(simplifiedVertices[oldIndex]);
        finalNormals.push(simplifiedNormals[oldIndex]);
        finalUVs.push(simplifiedUVs[oldIndex]);
        finalTangents.push(simplifiedTangents[oldIndex]);
        finalBitangents.push(simplifiedBitangents[oldIndex]);
      }
      simplifiedTriangles[i][k] = newIndices[oldIndex];
    }
  }

  return {
    vertices: finalVertices,
    normals: finalNormals,
    uvs: finalUVs,
    tangents: finalTangents,
    bitangents: finalBitangents,
    triangles: simplifiedTriangles,
    relatedRooms: [0],
    material: {
      "ambient": [0.1, 0.1, 0.1],
      "diffuse": [0.6, 0.4, 0.4],
      "specular": [0.3, 0.3, 0.3],
      "n": 11,
      "alpha": 1.0,
      "texture": ""
    }
  };
}
