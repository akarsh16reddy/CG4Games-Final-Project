import json
import numpy as np
import math

def obj_to_json(obj_path, json_path, material, scale=1.0, rotation_angle = 0, translate=[0.0, 0.0, 0.0]):
    obj_vertices = []
    obj_uvs = []
    obj_normals = []
    faces = []

    # Parse .obj file
    with open(obj_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if parts[0] == 'v':
                obj_vertices.append(list(map(float, parts[1:4])))
            elif parts[0] == 'vt':
                obj_uvs.append(list(map(float, parts[1:3])))
            elif parts[0] == 'vn':
                obj_normals.append(list(map(float, parts[1:4])))
            elif parts[0] == 'f':
                face = []
                if(len(parts) > 4):
                    raise Exception("Faces more!")
                for part in parts[1:]:
                    indices = part.split('/')
                    v = int(indices[0]) - 1  # .obj indices start at 1
                    vt = int(indices[1]) - 1 if len(indices) > 1 and indices[1] else -1
                    vn = int(indices[2]) - 1 if len(indices) > 2 and indices[2] else -1
                    face.append((v, vt, vn))
                faces.append(face)

    # Reindex vertices (combining v, vt, vn into unique entries)
    vertex_map = {}
    vertices = []
    normals = []
    uvs = []
    triangles = []

    # Initialize tangent and bitangent arrays
    tangents = []
    bitangents = []

    if isinstance(scale, (int, float)):
        scale = [scale, scale, scale]
        
    theta = math.radians(rotation_angle)  # or any angle in degrees
    rotation_matrix = [
        [ math.cos(theta), 0, math.sin(theta)],
        [ 0,              1, 0             ],
        [-math.sin(theta), 0, math.cos(theta)]
    ]
    for face in faces:
        tri_indices = []
        for v_idx, vt_idx, vn_idx in face:
            key = (v_idx, vt_idx, vn_idx)
            if key not in vertex_map:
                vertex_map[key] = len(vertices)
                # transformed_vertex = [
                #     sum(rotation_matrix[i][j] * (obj_vertices[v_idx][j] * scale[j]) for j in range(3)) + translate[i]
                #     for i in range(3)
                # ]
                vertices.append(obj_vertices[v_idx])
                if vt_idx != -1:
                    uvs.append(obj_uvs[vt_idx])
                else:
                    # raise Exception("Not enough vertices!" + str(vt_idx))
                    uvs.append([0.0, 0.0])  # Default UV if missing
                if vn_idx != -1:
                    normals.append(obj_normals[vn_idx])
                else:
                    # raise Exception("Not enough normals!")
                    normals.append([0.0, 0.0, 0.0])  # Default normal if missing
                tangents.append([0.0, 0.0, 0.0])  # Initialize tangents
                bitangents.append([0.0, 0.0, 0.0])  # Initialize bitangents
            tri_indices.append(vertex_map[key])
        triangles.append(tri_indices)

    # Export JSON
    output = {
        "material": material,
        "vertices": vertices,
        "normals": normals,
        "uvs": uvs,
        "tangents": tangents,
        "bitangents": bitangents,
        "triangles": triangles,
        "relatedRooms": [0]
    }

    with open(json_path, 'w') as f:
        json.dump(output, f, indent=2)

# Example usage
material = {
    "ambient": [0.1, 0.1, 0.1],
    "diffuse": [0.6, 0.6, 0.6],
    "specular": [0.3, 0.3, 0.3],
    "n": 11,
    "alpha": 0.9,
    "texture": "abe.png"
}
obj_to_json("teapot.obj", "output_teapot.json", material, 1.0, 0, [0.0, 0, 0.0])