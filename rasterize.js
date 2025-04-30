/* GLOBAL CONSTANTS AND VARIABLES */
var Heap = window.heap;
var ndarray = window.ndarray;
var ops = window.ops;
var solve = window.solve;

/* assignment specific globals */
const INPUT_URL = "https://ncsucg4games.github.io/prog2/"; // location of input files
var defaultEye = vec3.fromValues(0.5,0.5,-0.5); // default eye position in world space
var defaultCenter = vec3.fromValues(0.5,0.5,0.5); // default view direction in world space
var defaultUp = vec3.fromValues(0,1,0); // default view up vector
var lightAmbient = vec3.fromValues(1,1,1); // default light ambient emission
var lightDiffuse = vec3.fromValues(1,1,1); // default light diffuse emission
var lightSpecular = vec3.fromValues(1,1,1); // default light specular emission
var lightPositions = [ vec3.fromValues(0,4,0)
                    // , vec3.fromValues(-5,4,-5)
                    // , vec3.fromValues(-5,4,5)
                    // , vec3.fromValues(5,4,5)
                    // , vec3.fromValues(5,4,-5)
                    ]; // default light positions
var rotateTheta = Math.PI/50; // how much to rotate models by with each key press

/* input model data */
var gl = null; // the all powerful gl object. It's all here folks!
var hudDisplay = null;
var hudMap = {}; // Key-Value pairs to display on the HUD
var inputTriangles = []; // the triangle data as loaded from input files
var numTriangleSets = 0; // how many triangle sets in input scene
var triSetSizes = []; // this contains the size of each triangle set
var wireframeEdgeCount = [];
var inputSpheres = []; // the sphere data as loaded from input files
var hudTotalTriangles = 0;
var hudRenderedTriangles = 0;
var lastTimestamp = 0;
var lastFPSUpdate = 0;
var updateFPSEveryMS = 400;
var maxFrames = 10;
var frametimes = [];
var makeItYourOwnEnabled = false;
var makeItYourOwnAngle = 0;
var normalMappingStrength = 1.0;
var lodPercentageToDisplay = 100;
var lodPercentage = 100;
var shouldUpdateModels = false;
var modelVisibilityMap = { "cow": false,
                           "suzanne": false
                         }
/* model data prepared for webgl */
var vertexBuffers = []; // vertex coordinate lists by set, in triples
var normalBuffers = []; // normal component lists by set, in triples
var uvBuffers = []; // uv coord lists by set, in duples
var tangentBuffers = [];
var bitangentBuffers = [];
var triangleBuffers = []; // indices into vertexBuffers by set, in triples
var wireframeBuffers = [];
var colorBuffers = [];
var textures = []; // texture imagery by set
var normalMapsOfTextures = [];

/* shader parameter locations */
var vPosAttribLoc; // where to put position for vertex shader
var vNormAttribLoc; // where to put normal for vertex shader
var vUVAttribLoc; // where to put UV for vertex shader
var vTangentAttribLoc;
var vBitangentAttribLoc;
var vLineColorLoc;
var mMatrixULoc; // where to put model matrix for vertex shader
var pvmMatrixULoc; // where to put project model view matrix for vertex shader
var ambientULoc; // where to put ambient reflecivity for fragment shader
var diffuseULoc; // where to put diffuse reflecivity for fragment shader
var specularULoc; // where to put specular reflecivity for fragment shader
var shininessULoc; // where to put specular exponent for fragment shader
var alphaULoc;
var usingTextureULoc; // where to put using texture boolean for fragment shader
var textureULoc; // where to put texture for fragment shader
var normalMapTextureULoc;
var lightPositionsULoc;
var numLightsULoc;
var makeItYourOwnULoc;
var isFloorULoc;
var isNormalMappingEnabledULoc;
var NormalExaggerationFactorULoc;
var eyePositionULoc;
var torchPositionULoc;

/* interaction variables */
var Eye = vec3.clone(defaultEye); // eye position in world space
var Center = vec3.clone(defaultCenter); // view direction in world space
var Up = vec3.clone(defaultUp); // view up vector in world space
var viewDelta = 0; // how much to displace view with each key press

// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    try {
        if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
            throw "getJSONFile: parameter not a string";
        else {
            var httpReq = new XMLHttpRequest(); // a new http request
            httpReq.open("GET",url,false); // init the request
            httpReq.send(null); // send the request
            var startTime = Date.now();
            while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
                if ((Date.now()-startTime) > 3000)
                    break;
            } // until its loaded or we time out after three seconds
            if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
                throw "Unable to open "+descr+" file!";
            else
                return JSON.parse(httpReq.response); 
        } // end if good params
    } // end try    
    
    catch(e) {
        console.log(e);
        return(String.null);
    }
} // end get input spheres

// does stuff when keys are pressed
function handleKeyDown(event) {
    
    const modelEnum = {TRIANGLES: "triangles", SPHERE: "sphere"}; // enumerated model type
    const dirEnum = {NEGATIVE: -1, POSITIVE: 1}; // enumerated rotation direction
    
    function highlightModel(modelType,whichModel) {
        if (handleKeyDown.modelOn != null)
            handleKeyDown.modelOn.on = false;
        handleKeyDown.whichOn = whichModel;
        if (modelType == modelEnum.TRIANGLES)
            handleKeyDown.modelOn = inputTriangles[whichModel]; 
        else
            handleKeyDown.modelOn = inputSpheres[whichModel]; 
        handleKeyDown.modelOn.on = true; 
    } // end highlight model
    
    function translateModel(offset) {
        if (handleKeyDown.modelOn != null)
            vec3.add(handleKeyDown.modelOn.translation,handleKeyDown.modelOn.translation,offset);
    } // end translate model

    function rotateModel(axis,direction) {
        if (handleKeyDown.modelOn != null) {
            var newRotation = mat4.create();

            mat4.fromRotation(newRotation,direction*rotateTheta,axis); // get a rotation matrix around passed axis
            vec3.transformMat4(handleKeyDown.modelOn.xAxis,handleKeyDown.modelOn.xAxis,newRotation); // rotate model x axis tip
            vec3.transformMat4(handleKeyDown.modelOn.yAxis,handleKeyDown.modelOn.yAxis,newRotation); // rotate model y axis tip
        } // end if there is a highlighted model
    } // end rotate model
    
    // set up needed view params
    var lookAt = vec3.create(), viewRight = vec3.create(), temp = vec3.create(); // lookat, right & temp vectors
    lookAt = vec3.normalize(lookAt,vec3.subtract(temp,Center,Eye)); // get lookat vector
    viewRight = vec3.normalize(viewRight,vec3.cross(temp,lookAt,Up)); // get view right vector
    
    // highlight static variables
    handleKeyDown.whichOn = handleKeyDown.whichOn == undefined ? -1 : handleKeyDown.whichOn; // nothing selected initially
    handleKeyDown.modelOn = handleKeyDown.modelOn == undefined ? null : handleKeyDown.modelOn; // nothing selected initially

    switch (event.code) {
        
        // model selection
        case "Space": 
            if (handleKeyDown.modelOn != null)
                handleKeyDown.modelOn.on = false; // turn off highlighted model
            handleKeyDown.modelOn = null; // no highlighted model
            handleKeyDown.whichOn = -1; // nothing highlighted
            break;
        case "ArrowRight": // select next triangle set
            highlightModel(modelEnum.TRIANGLES,(handleKeyDown.whichOn+1) % numTriangleSets);
            break;
        case "ArrowLeft": // select previous triangle set
            highlightModel(modelEnum.TRIANGLES,(handleKeyDown.whichOn > 0) ? handleKeyDown.whichOn-1 : numTriangleSets-1);
            break;
            
        // view change
        case "KeyA": // translate view left, rotate left with shift
            Center = vec3.add(Center,Center,vec3.scale(temp,viewRight,viewDelta));
            if (!event.getModifierState("Shift"))
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,viewRight,viewDelta));
            break;
        case "KeyD": // translate view right, rotate right with shift
            Center = vec3.add(Center,Center,vec3.scale(temp,viewRight,-viewDelta));
            if (!event.getModifierState("Shift"))
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,viewRight,-viewDelta));
            break;
        case "KeyS": // translate view backward, rotate up with shift
            if (event.getModifierState("Shift")) {
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,viewDelta));
                Up = vec3.cross(Up,viewRight,vec3.subtract(lookAt,Center,Eye)); /* global side effect */
            } else {
                if(makeItYourOwnEnabled) handleMakeItYourOwn();
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,lookAt,-viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,lookAt,-viewDelta));
            } // end if shift not pressed
            break;
        case "KeyW": // translate view forward, rotate down with shift
            if (event.getModifierState("Shift")) {
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,-viewDelta));
                Up = vec3.cross(Up,viewRight,vec3.subtract(lookAt,Center,Eye)); /* global side effect */
            } else {
                if(makeItYourOwnEnabled) handleMakeItYourOwn();
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,lookAt,viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,lookAt,viewDelta));
            } // end if shift not pressed
            break;
        case "KeyQ": // translate view up, rotate counterclockwise with shift
            if (event.getModifierState("Shift"))
                Up = vec3.normalize(Up,vec3.add(Up,Up,vec3.scale(temp,viewRight,-viewDelta)));
            else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,Up,viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,viewDelta));
            } // end if shift not pressed
            break;
        case "KeyE": // translate view down, rotate clockwise with shift
            if (event.getModifierState("Shift"))
                Up = vec3.normalize(Up,vec3.add(Up,Up,vec3.scale(temp,viewRight,viewDelta)));
            else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,Up,-viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,-viewDelta));
            } // end if shift not pressed
            break;
        case "Escape": // reset view to default
            Eye = vec3.copy(Eye,defaultEye);
            Center = vec3.copy(Center,defaultCenter);
            Up = vec3.copy(Up,defaultUp);
            break;
            
        // model transformation
        case "KeyK": // translate left, rotate left with shift
            if (event.getModifierState("Shift"))
                rotateModel(Up,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,viewRight,viewDelta));
            break;
        case "Semicolon": // translate right, rotate right with shift
            if (event.getModifierState("Shift"))
                rotateModel(Up,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,viewRight,-viewDelta));
            break;
        case "KeyL": // translate backward, rotate up with shift
            if (event.getModifierState("Shift"))
                rotateModel(viewRight,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,lookAt,-viewDelta));
            break;
        case "KeyO": // translate forward, rotate down with shift
            if (event.getModifierState("Shift"))
                rotateModel(viewRight,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,lookAt,viewDelta));
            break;
        case "KeyI": // translate up, rotate counterclockwise with shift 
            if (event.getModifierState("Shift"))
                rotateModel(lookAt,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,Up,viewDelta));
            break;
        case "KeyP": // translate down, rotate clockwise with shift
            if (event.getModifierState("Shift"))
                rotateModel(lookAt,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,Up,-viewDelta));
            break;
        case "Backspace": // reset model transforms to default
            for (var whichTriSet=0; whichTriSet<numTriangleSets; whichTriSet++) {
                vec3.set(inputTriangles[whichTriSet].translation,0,0,0);
                vec3.set(inputTriangles[whichTriSet].xAxis,1,0,0);
                vec3.set(inputTriangles[whichTriSet].yAxis,0,1,0);
            } // end for all triangle sets
            break;
        case "Digit1":
            if(event.getModifierState("Shift")) {
              // Make it your own part
              makeItYourOwnEnabled = !makeItYourOwnEnabled;
              handleMakeItYourOwn();
            }
    } // end switch
} // end handleKeyDown

// set up the webGL environment
function setupWebGL() {
    
    // Set up keys
    document.onkeydown = handleKeyDown; // call this when key pressed

    // create a webgl canvas and set it up
    var webGLCanvas = document.getElementById("myWebGLCanvas"); // create a webgl canvas
    hudDisplay = document.getElementById("hudDisplayDiv");
    gl = webGLCanvas.getContext("webgl"); // get a webgl object from it
    try {
      if (gl == null || hudDisplay == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
        gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
        gl.lineWidth(1.0);
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL

// Helper to convert strings with spaces to camel case strings
function camelCase(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}

function handleHUDElement(str, value, flag) {
  const camelCaseKey = camelCase(str);
  
  let resolvedElement;
  if(camelCaseKey in hudMap) {
    resolvedElement = document.getElementById(camelCaseKey);
  } else {
    const newElement = document.createElement("p");
    newElement.id = camelCaseKey;
    newElement.style.color = "black";
    newElement.style.margin = "2px";
    newElement.style.fontSize = "15px";
    resolvedElement = newElement;
    hudDisplay.appendChild(resolvedElement);
    hudMap[camelCaseKey] = value;
  }
  if(flag === undefined || flag === null) {
    resolvedElement.innerText = str + ": " + value;
  } else {
    resolvedElement.innerHTML = str + 
                                ": " + 
                                "<p style='display:inline;color:" + (flag ? "green" : "red") + ";'>" + value + "</p>";
  }
}

function generateFloor(startX, startZ, endX, endZ) {
  const floorVertices = [];
  const triangles = [];
  const normals = [];
  const uvs = [];
  const tangents = [];
  const bitangents = [];

  const stepX = 1.0; // unit size
  const stepZ = 1.0; // unit size

  const numX = Math.ceil((endX - startX) / stepX);
  const numZ = Math.ceil((endZ - startZ) / stepZ);

  // Generate vertices
  for (let z = 0; z <= numZ; z++) {
    for (let x = 0; x <= numX; x++) {
      const vx = startX + x * stepX;
      const vz = startZ + z * stepZ;
      floorVertices.push([vx, 0, vz]);
      normals.push([0, 1, 0]); // Upward normal
      uvs.push([x, z]); // Simple UVs (scaled by grid position)
      tangents.push([0, 0, 0]);
      bitangents.push([0, 0, 0]);
    }
  }

  // Generate triangles (two per unit cell)
  for (let z = 0; z < numZ; z++) {
    for (let x = 0; x < numX; x++) {
      const topLeft = z * (numX + 1) + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + (numX + 1);
      const bottomRight = bottomLeft + 1;

      // Triangle 1: topLeft, bottomLeft, bottomRight
      triangles.push([topLeft, bottomLeft, bottomRight]);
      // Triangle 2: topLeft, bottomRight, topRight
      triangles.push([topLeft, bottomRight, topRight]);
    }
  }

  // Tangent/bitangent calculation
  triangles.forEach(tri => {
    const [i0, i1, i2] = tri;
    const v0 = floorVertices[i0], v1 = floorVertices[i1], v2 = floorVertices[i2];
    const uv0 = uvs[i0], uv1 = uvs[i1], uv2 = uvs[i2];

    // Edges
    const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const deltaUV1 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
    const deltaUV2 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];

    const f = 1.0 / (deltaUV1[0] * deltaUV2[1] - deltaUV1[1] * deltaUV2[0]);

    const tangent = [
      f * (deltaUV2[1] * edge1[0] - deltaUV1[1] * edge2[0]),
      f * (deltaUV2[1] * edge1[1] - deltaUV1[1] * edge2[1]),
      f * (deltaUV2[1] * edge1[2] - deltaUV1[1] * edge2[2])
    ];

    const bitangent = [
      f * (-deltaUV2[0] * edge1[0] + deltaUV1[0] * edge2[0]),
      f * (-deltaUV2[0] * edge1[1] + deltaUV1[0] * edge2[1]),
      f * (-deltaUV2[0] * edge1[2] + deltaUV1[0] * edge2[2])
    ];

    [i0, i1, i2].forEach(i => {
      tangents[i][0] += tangent[0]; tangents[i][1] += tangent[1]; tangents[i][2] += tangent[2];
      bitangents[i][0] += bitangent[0]; bitangents[i][1] += bitangent[1]; bitangents[i][2] += bitangent[2];
    });
  });

  // Normalize tangents and bitangents
  for (let i = 0; i < floorVertices.length; i++) {
    const lenT = Math.sqrt(tangents[i][0] ** 2 + tangents[i][1] ** 2 + tangents[i][2] ** 2);
    tangents[i] = lenT > 0 ? [tangents[i][0] / lenT, tangents[i][1] / lenT, tangents[i][2] / lenT] : [1, 0, 0];

    const lenB = Math.sqrt(bitangents[i][0] ** 2 + bitangents[i][1] ** 2 + bitangents[i][2] ** 2);
    bitangents[i] = lenB > 0 ? [bitangents[i][0] / lenB, bitangents[i][1] / lenB, bitangents[i][2] / lenB] : [0, 0, 1];
  }

  // Return the final structured object
  return {
    "material": {
      "ambient": [0.1, 0.1, 0.1],
      "diffuse": [0.6, 0.4, 0.4],
      "specular": [0.3, 0.3, 0.3],
      "n": 11,
      "alpha": 1.0,
      "texture": "https://akarsh16reddy.github.io/CG4Games-Final-Project/bump_map_texture.png",
      "normalMapImage": "https://akarsh16reddy.github.io/CG4Games-Final-Project/bump_map_normal_map.png"
    },
    "vertices": floorVertices,
    "normals": normals,
    "uvs": uvs,
    "triangles": triangles,
    "tangents": tangents,
    "bitangents": bitangents,
    "isFloor": true,
    "visibility": true
  };
}

// Helper function to compute torch position
function getTorchPosition(eyePosition, viewMatrix) {
  // Extract camera's forward direction (negative Z-axis in view matrix)
  let forward = [
      -viewMatrix[2], // X component
      -viewMatrix[6], // Y component
      -viewMatrix[10] // Z component
  ];

  // Normalize the forward vector
  let length = Math.sqrt(forward[0] ** 2 + forward[1] ** 2 + forward[2] ** 2);
  forward = forward.map((v) => v / length);

  // Position torch 0.5 units ahead of the camera
  return [
      eyePosition[0],
      eyePosition[1],
      eyePosition[2] 
  ];
}


// load a texture for the current set or sphere
function loadTexture(whichModel, currModel,textureFile, isNormalMap, forceTextureToImage) {
  
  var currTexture;
  // load a 1x1 gray image into texture for use when no texture, and until texture loads
  if(isNormalMap) {
    normalMapsOfTextures[whichModel] = gl.createTexture();
    currTexture = normalMapsOfTextures[whichModel];
  } else {
    textures[whichModel] = gl.createTexture(); // new texture struct for model
    currTexture = textures[whichModel]; // shorthand
  }
  gl.bindTexture(gl.TEXTURE_2D, currTexture); // activate model's texture
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // invert vertical texcoord v, load gray 1x1
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,new Uint8Array([64, 64, 64, 255]));        
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // invert vertical texcoord v
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // use linear filter for magnification
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // use mipmap for minification
  gl.generateMipmap(gl.TEXTURE_2D); // construct mipmap pyramid
  gl.bindTexture(gl.TEXTURE_2D, null); // deactivate model's texture
  
  // if there is a texture to load, asynchronously load it
  if (textureFile != false) {
      currTexture.image = new Image(); // new image struct for texture
      currTexture.image.onload = function () { // when texture image loaded...
          gl.bindTexture(gl.TEXTURE_2D, currTexture); // activate model's new texture
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, currTexture.image); // norm 2D texture
          gl.generateMipmap(gl.TEXTURE_2D); // rebuild mipmap pyramid
          gl.bindTexture(gl.TEXTURE_2D, null); // deactivate model's new texture
      } // end when texture image loaded
      currTexture.image.onerror = function () { // when texture image load fails...
          console.log("Unable to load texture " + textureFile); 
      } // end when texture image load fails
      currTexture.image.crossOrigin = "Anonymous"; // allow cross origin load, please
      if(textureFile){
        if(forceTextureToImage) {
          currTexture.image.src = textureFile; // set image location
        } else if(textureFile.startsWith("https://") || textureFile.startsWith("http://")) {
          currTexture.image.src = textureFile; // set image location
        } else {
          currTexture.image.src = INPUT_URL + textureFile; // set image location
        }
      }
  } // end if material has a texture
} // end load texture

function updateModelBasedOnLOD(whichSet) {
  var currSet = inputTriangles[whichSet];
  var whichSetVert;
  var whichSetTri;
  var vtxToAdd;
  var normToAdd;
  var uvToAdd;
  var triToAdd;

  // set up hilighting, modeling translation and rotation
  currSet.center = vec3.fromValues(0,0,0);  // center point of tri set
  currSet.on = false; // not highlighted
  currSet.translation = vec3.fromValues(0,0,0); // no translation
  currSet.xAxis = vec3.fromValues(1,0,0); // model X axis
  currSet.yAxis = vec3.fromValues(0,1,0); // model Y axis 

  // set up the vertex, normal and uv arrays, define model center and axes
  currSet.glVertices = []; // flat coord list for webgl
  currSet.glNormals = []; // flat normal list for webgl
  currSet.glUvs = []; // flat texture coord list for webgl
  currSet.glTangents = [];
  currSet.glBitangents = [];
  var numVerts = currSet.vertices.length; // num vertices in tri set
  for (whichSetVert=0; whichSetVert<numVerts; whichSetVert++) { // verts in set
      vtxToAdd = currSet.vertices[whichSetVert]; // get vertex to add
      normToAdd = currSet.normals[whichSetVert]; // get normal to add
      tangentToAdd = currSet.tangents[whichSetVert];
      bitangentToAdd = currSet.bitangents[whichSetVert];
      uvToAdd = currSet.uvs[whichSetVert]; // get uv to add
      currSet.glVertices.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]); // put coords in set vertex list
      currSet.glNormals.push(normToAdd[0],normToAdd[1],normToAdd[2]); // put normal in set normal list
      currSet.glTangents.push(tangentToAdd[0], tangentToAdd[1], tangentToAdd[2]);
      currSet.glBitangents.push(bitangentToAdd[0], bitangentToAdd[1], bitangentToAdd[2]);
      currSet.glUvs.push(uvToAdd[0],uvToAdd[1]); // put uv in set uv list
      vec3.add(currSet.center,currSet.center,vtxToAdd); // add to ctr sum
  } // end for vertices in set
  vec3.scale(currSet.center,currSet.center,1/numVerts); // avg ctr sum

  // send the vertex coords, normals and uvs to webGL; load texture
  gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichSet]); // activate that buffer
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glVertices),gl.DYNAMIC_DRAW ); // data in

  gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichSet]); // activate that buffer
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glNormals),gl.DYNAMIC_DRAW ); // data in

  gl.bindBuffer(gl.ARRAY_BUFFER,tangentBuffers[whichSet]);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glTangents),gl.DYNAMIC_DRAW ); // data in

  gl.bindBuffer(gl.ARRAY_BUFFER,bitangentBuffers[whichSet]);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glBitangents),gl.DYNAMIC_DRAW ); // data in

  gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffers[whichSet]); // activate that buffer
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glUvs),gl.DYNAMIC_DRAW ); // data in

  // set up the triangle index array, adjusting indices across sets
  currSet.glTriangles = []; // flat index list for webgl
  currSet.glWireFrameIndices = [];
  triSetSizes[whichSet] = currSet.triangles.length; // number of tris in this set
  for (whichSetTri=0; whichSetTri<triSetSizes[whichSet]; whichSetTri++) {
      triToAdd = currSet.triangles[whichSetTri]; // get tri to add
      currSet.glTriangles.push(triToAdd[0],triToAdd[1],triToAdd[2]); // put indices in set list
      currSet.glWireFrameIndices.push(triToAdd[0],triToAdd[1]);
      currSet.glWireFrameIndices.push(triToAdd[1],triToAdd[2]);
      currSet.glWireFrameIndices.push(triToAdd[2],triToAdd[0]);
    } // end for triangles in set
  wireframeEdgeCount[whichSet] = currSet.glWireFrameIndices.length;

  currSet = addDistinctLineColors(currSet);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffers[whichSet]);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(currSet.lineColors.flat()), gl.DYNAMIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[whichSet]); // activate that buffer
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(currSet.glTriangles),gl.DYNAMIC_DRAW ); // data in
  
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireframeBuffers[whichSet]);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(currSet.glWireFrameIndices), gl.DYNAMIC_DRAW );
}

function addCountToModel(model) {
  model.numberOfVertices = model.vertices.length;
  model.numberOfTriangles = model.triangles.length;
}

function addLODModifier(model) {
  addCountToModel(model)
  model.updateLOD = (percentage) => simplifyMeshOptimized(model.triangles, model.vertices)(model.numberOfVertices * percentage/100);
}

function handleVisibilityOfModels() {
  inputTriangles[1].visibility = modelVisibilityMap.cow;
  inputTriangles[2].visibility = modelVisibilityMap.suzanne;
}

function handleTotalTrianglesCount() {
  hudTotalTriangles = 0;
  inputTriangles.forEach((model) => {
    if(model.visibility) hudTotalTriangles += model.numberOfTriangles;
  })
  handleHUDElement("Total Triangles", hudTotalTriangles);
}

function renderWithLOD () {
  if(!shouldUpdateModels) return;
  for(let whichSet = 0; whichSet < inputTriangles.length; whichSet++) {
    if(typeof inputTriangles[whichSet].updateLOD === 'function') {
      const {triangles, vertices} = inputTriangles[whichSet].updateLOD(lodPercentage);
      inputTriangles[whichSet] = {
        ...inputTriangles[whichSet],
        triangles: triangles,
        vertices: vertices
      }
      updateModelBasedOnLOD(whichSet);
    }
  }
  shouldUpdateModels = false;
}

// read models in, load them into webgl buffers
function loadModels() {

    inputTriangles = [];

    // Generate Floor
    const floor = generateFloor(-10,-10,10,10);
    addCountToModel(floor);
    inputTriangles.push(floor);

    const cowJSON = getJSONFile("https://akarsh16reddy.github.io/CG4Games-Final-Project/output_cow.json","cow");
    addLODModifier(cowJSON);
    inputTriangles.push(cowJSON);

    const suzanneJSON = getJSONFile("https://akarsh16reddy.github.io/CG4Games-Final-Project/output_suzanne.json","suzanne");
    addLODModifier(suzanneJSON);
    inputTriangles.push(suzanneJSON);

    // Enumerate triangles and render on HUD
    inputTriangles.forEach((set) => {
      hudTotalTriangles += set.triangles.length;
    });
    handleHUDElement("Total Triangles", hudTotalTriangles);

    try {
        if (inputTriangles == String.null)
            throw "Unable to load triangles file!";
        else {
            var currSet; // the current triangle set
            var whichSetVert; // index of vertex in current triangle set
            var whichSetTri; // index of triangle in current triangle set
            var vtxToAdd; // vtx coords to add to the vertices array
            var normToAdd; // vtx normal to add to the normal array
            var uvToAdd; // uv coords to add to the uv arry
            var triToAdd; // tri indices to add to the index array
            var maxCorner = vec3.fromValues(Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE); // bbox corner
            var minCorner = vec3.fromValues(Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE); // other corner
        
            // process each triangle set to load webgl vertex and triangle buffers
            numTriangleSets = inputTriangles.length; // remember how many tri sets
            for (var whichSet=0; whichSet<numTriangleSets; whichSet++) { // for each tri set
                currSet = inputTriangles[whichSet];
                // set up hilighting, modeling translation and rotation
                currSet.center = vec3.fromValues(0,0,0);  // center point of tri set
                currSet.on = false; // not highlighted
                currSet.translation = vec3.fromValues(0,0,0); // no translation
                currSet.xAxis = vec3.fromValues(1,0,0); // model X axis
                currSet.yAxis = vec3.fromValues(0,1,0); // model Y axis 

                // set up the vertex, normal and uv arrays, define model center and axes
                currSet.glVertices = []; // flat coord list for webgl
                currSet.glNormals = []; // flat normal list for webgl
                currSet.glUvs = []; // flat texture coord list for webgl
                currSet.glTangents = [];
                currSet.glBitangents = [];
                var numVerts = currSet.vertices.length; // num vertices in tri set
                for (whichSetVert=0; whichSetVert<numVerts; whichSetVert++) { // verts in set
                    vtxToAdd = currSet.vertices[whichSetVert]; // get vertex to add
                    normToAdd = currSet.normals[whichSetVert]; // get normal to add
                    tangentToAdd = currSet.tangents[whichSetVert];
                    bitangentToAdd = currSet.bitangents[whichSetVert];
                    uvToAdd = currSet.uvs[whichSetVert]; // get uv to add
                    currSet.glVertices.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]); // put coords in set vertex list
                    currSet.glNormals.push(normToAdd[0],normToAdd[1],normToAdd[2]); // put normal in set normal list
                    currSet.glTangents.push(tangentToAdd[0], tangentToAdd[1], tangentToAdd[2]);
                    currSet.glBitangents.push(bitangentToAdd[0], bitangentToAdd[1], bitangentToAdd[2]);
                    currSet.glUvs.push(uvToAdd[0],uvToAdd[1]); // put uv in set uv list
                    vec3.max(maxCorner,maxCorner,vtxToAdd); // update world bounding box corner maxima
                    vec3.min(minCorner,minCorner,vtxToAdd); // update world bounding box corner minima
                    vec3.add(currSet.center,currSet.center,vtxToAdd); // add to ctr sum
                } // end for vertices in set
                vec3.scale(currSet.center,currSet.center,1/numVerts); // avg ctr sum

                // send the vertex coords, normals and uvs to webGL; load texture
                vertexBuffers[whichSet] = gl.createBuffer(); // init empty webgl set vertex coord buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glVertices),gl.STATIC_DRAW); // data in

                normalBuffers[whichSet] = gl.createBuffer(); // init empty webgl set normal component buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glNormals),gl.STATIC_DRAW); // data in

                tangentBuffers[whichSet] = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER,tangentBuffers[whichSet]);
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glTangents),gl.STATIC_DRAW); // data in

                bitangentBuffers[whichSet] = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER,bitangentBuffers[whichSet]);
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glBitangents),gl.STATIC_DRAW); // data in

                uvBuffers[whichSet] = gl.createBuffer(); // init empty webgl set uv coord buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glUvs),gl.STATIC_DRAW); // data in

                loadTexture(whichSet,currSet,currSet.material.texture); // load tri set's texture
                loadTexture(whichSet,currSet,currSet.material.normalMapImage, true); // load tri set's texture

                // set up the triangle index array, adjusting indices across sets
                currSet.glTriangles = []; // flat index list for webgl
                currSet.glWireFrameIndices = [];
                triSetSizes[whichSet] = currSet.triangles.length; // number of tris in this set
                for (whichSetTri=0; whichSetTri<triSetSizes[whichSet]; whichSetTri++) {
                    triToAdd = currSet.triangles[whichSetTri]; // get tri to add
                    currSet.glTriangles.push(triToAdd[0],triToAdd[1],triToAdd[2]); // put indices in set list
                    currSet.glWireFrameIndices.push(triToAdd[0],triToAdd[1]);
                    currSet.glWireFrameIndices.push(triToAdd[1],triToAdd[2]);
                    currSet.glWireFrameIndices.push(triToAdd[2],triToAdd[0]);
                  } // end for triangles in set
                wireframeEdgeCount[whichSet] = currSet.glWireFrameIndices.length;
                
                currSet = addDistinctLineColors(currSet);

                colorBuffers[whichSet] = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffers[whichSet]);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(currSet.lineColors.flat()), gl.STATIC_DRAW);

                // send the triangle indices to webGL
                triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(currSet.glTriangles),gl.STATIC_DRAW); // data in
                
                wireframeBuffers.push(gl.createBuffer());
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireframeBuffers[whichSet]);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(currSet.glWireFrameIndices), gl.STATIC_DRAW);

            } // end for each triangle set

            var temp = vec3.create(); // an intermediate vec3
            viewDelta = vec3.length(vec3.subtract(temp,maxCorner,minCorner)) / 400; // set global
            console.log(inputTriangles);        
        } // end if triangle file loaded
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch

    document.getElementById("textureInput").addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (file && file.type === "image/png") {
        const reader = new FileReader();
        reader.onload = function (e) {
          // Trigger your texture loader with the base64 data URL
          loadTexture(0, null, e.target.result, false, true); // assuming `true` for normal map
        };
        reader.readAsDataURL(file); // convert file to base64 data URL
      } else {
        console.error("Please upload a valid PNG file.");
      }
    });

    document.getElementById("normalMapInput").addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (file && file.type === "image/png") {
        const reader = new FileReader();
        reader.onload = function (e) {
          // Trigger your texture loader with the base64 data URL
          loadTexture(0, null, e.target.result, true, true); // assuming `true` for normal map
        };
        reader.readAsDataURL(file); // convert file to base64 data URL
      } else {
        console.error("Please upload a valid PNG file.");
      }
    });

    const strengthSlider = document.getElementById('normalMapStrength');
    const strengthValueDisplay = document.getElementById('normalMapStrengthValue');

    // Update the number next to the slider when user moves it
    strengthSlider.addEventListener('input', function(event) {
      normalMappingStrength = parseFloat(event.target.value);
      strengthValueDisplay.textContent = normalMappingStrength.toFixed(2);
    });

    const lodTargetPercentageSlider = document.getElementById('lodPercent');
    const lodTargetPercentageDisplay = document.getElementById('lodPercentValue');

    // Update the number next to the slider when user moves it
    lodTargetPercentageSlider.addEventListener('input', function(event) {
      lodPercentageToDisplay = parseInt(event.target.value);
      lodTargetPercentageDisplay.textContent = lodPercentageToDisplay.toFixed(0);
    });

    lodTargetPercentageSlider.addEventListener('change', function(event) {
      lodPercentageToDisplay = parseInt(event.target.value);
      lodTargetPercentageDisplay.textContent = lodPercentageToDisplay.toFixed(0);
      lodPercentage = lodPercentageToDisplay;
      shouldUpdateModels = true;
    });

    document.getElementById('cowCheckbox').addEventListener('change', function(e) {
      modelVisibilityMap.cow = e.target.checked;
    });    

    document.getElementById('suzanneCheckbox').addEventListener('change', function(e) {
      modelVisibilityMap.suzanne = e.target.checked;
    });    
} // end load models

// setup the webGL shaders
function setupShaders() {
    
    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        attribute vec2 aVertexUV; // vertex texture uv
        attribute vec3 aTangent;      // Tangent vector
        attribute vec3 aBitangent;    // Bitangent vector
        attribute vec3 aLineColor; // gl.LINES primitive coloring
        
        uniform mat4 umMatrix; // the model matrix
        uniform mat4 upvmMatrix; // the project view model matrix
        
        varying vec3 vWorldPos; // interpolated world position of vertex
        varying vec3 vVertexNormal; // interpolated normal for frag shader
        varying vec2 vVertexUV; // interpolated uv for frag shader
        varying mat3 vTBN; // Tangent-to-world matrix
        varying vec3 vLineColor; 

        void main(void) {
            
            // vertex position
            vec4 vWorldPos4 = umMatrix * vec4(aVertexPosition, 1.0);
            vWorldPos = vec3(vWorldPos4.x,vWorldPos4.y,vWorldPos4.z);
            gl_Position = upvmMatrix * vec4(aVertexPosition, 1.0);

            // vertex normal (assume no non-uniform scale)
            vec4 vWorldNormal4 = umMatrix * vec4(aVertexNormal, 0.0);
            vVertexNormal = normalize(vec3(vWorldNormal4.x,vWorldNormal4.y,vWorldNormal4.z)); 
            
            // vertex uv
            vVertexUV = aVertexUV;

            // Construct TBN matrix
            vec3 T = normalize(vec3(umMatrix * vec4(aTangent, 0.0)));
            vec3 B = normalize(vec3(umMatrix * vec4(aBitangent, 0.0)));
            vec3 N = normalize(vec3(umMatrix * vec4(aVertexNormal, 0.0)));
            vTBN = mat3(T, B, N);  // Transpose for world-to-tangent space

            vLineColor = aLineColor;
        }
    `;
    
    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        precision mediump float; // set float to medium precision

        #define MAX_LIGHTS 5

        // eye location
        uniform vec3 uEyePosition; // the eye's position in world
        
        // light properties
        uniform vec3 uLightAmbient; // the light's ambient color
        uniform vec3 uLightDiffuse; // the light's diffuse color
        uniform vec3 uLightSpecular; // the light's specular color
        uniform vec3 uLightPosition; // the light's position
        
        uniform int uNumLights;
        uniform vec3 uLightPositions[MAX_LIGHTS];

        // material properties
        uniform vec3 uAmbient; // the ambient reflectivity
        uniform vec3 uDiffuse; // the diffuse reflectivity
        uniform vec3 uSpecular; // the specular reflectivity
        uniform float uShininess; // the specular exponent
        uniform float uAlpha; // the alpha component
        
        // texture properties
        uniform bool uUsingTexture; // if we are using a texture
        uniform sampler2D uTexture; // the texture for the fragment
        uniform sampler2D uNormalMapTexture;
        varying vec2 vVertexUV; // texture uv of fragment
            
        // geometry properties
        varying vec3 vWorldPos; // world xyz of fragment
        varying vec3 vVertexNormal; // normal of fragment
        varying mat3 vTBN;
        
        // make it your own
        uniform bool uMIYOFlag;
        uniform vec3 uTorchPosition; // the torch's position (computed in JS)

        // if rendering floor, use normal mapping
        uniform bool uIsFloor;
        uniform bool uIsNormalMappingEnabled;
        uniform float uNormalExaggerationFactor;

        varying vec3 vLineColor;

        void main(void) {
            vec3 normal = normalize(vVertexNormal); 
            vec3 normalTangentSpace;
            if(uIsFloor && uIsNormalMappingEnabled) {
              normalTangentSpace = texture2D(uNormalMapTexture, vVertexUV).rgb * 2.0 - 1.0;
              normalTangentSpace.xy *= uNormalExaggerationFactor; // exaggeration factor; you can try 2.0, 3.0, etc.
              normal = normalize(vTBN * normalTangentSpace);
            }
            
            vec3 litColor = vec3(0.0);
            vec3 eye = normalize(uEyePosition - vWorldPos);

            for(int i = 0; i < MAX_LIGHTS; i++) {
              if (i >= uNumLights) break;

              // ambient term
              vec3 ambient = uAmbient*uLightAmbient; 

              // diffuse term
              vec3 light = normalize(uLightPositions[i] - vWorldPos);
              float lambert = max(0.0,dot(normal,light));
              vec3 diffuse = uDiffuse*uLightDiffuse*lambert;
              
              // specular term
              vec3 halfVec = normalize(light+eye);
              float highlight = pow(max(0.0,dot(normal,halfVec)),uShininess);
              vec3 specular = uSpecular*uLightSpecular*highlight; // specular term
              
              // combine to find lit color
              litColor = litColor + ambient + diffuse + specular; 
            }
            
            // --- Torch light calculation (if uMIYOFlag is true) ---
            if (uMIYOFlag) {
              float distanceToTorch = length(uTorchPosition - vWorldPos);

              // If within 2 units of the torch, add red-tinged torch light
              if (distanceToTorch <= 2.0) {
                  vec3 torchLightDir = normalize(uTorchPosition - vWorldPos);
                  float torchLambert = max(0.0, dot(normal, torchLightDir));

                  // Red-tinged torch color (you can adjust the intensity here)
                  vec3 torchDiffuse = vec3(1.0, 0.2, 0.2) * torchLambert;

                  vec3 torchLight = normalize(uTorchPosition - vWorldPos);
                  vec3 torchHalfVec = normalize(torchLight + eye);
                  float torchHighlight = pow(max(0.0, dot(normal, torchHalfVec)), uShininess);
                  vec3 torchSpecular = uSpecular * vec3(1.0, 0.2, 0.2) * torchHighlight;

                  // Smooth falloff as distance increases
                  float torchIntensity = 1.0 - (distanceToTorch / 2.0);
                  torchDiffuse *= torchIntensity;

                  litColor += torchDiffuse + torchSpecular;
              }
            }

            if(uIsFloor) {
              vec4 texColor = texture2D(uTexture, vec2(vVertexUV.s, vVertexUV.t));
              gl_FragColor = vec4(texColor.rgb * litColor, texColor.a);
            } else {
              gl_FragColor = vec4(vLineColor,1.0);
            }

            // if (!uUsingTexture) {
            //     // gl_FragColor = vec4(litColor, 1.0);
            // } else {
            //     vec4 texColor = texture2D(uTexture, vec2(vVertexUV.s, vVertexUV.t));
            
            //     // gl_FragColor = vec4(texColor.rgb * litColor, texColor.a);
            //     // gl_FragColor = vec4(texColor.rgb * litColor, uAlpha);
            // } // end if using texture

        } // end main
    `;
    
    try {
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            var shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                
                // locate and enable vertex attributes
                vPosAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexPosition"); // ptr to vertex pos attrib
                gl.enableVertexAttribArray(vPosAttribLoc); // connect attrib to array
                vNormAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexNormal"); // ptr to vertex normal attrib
                gl.enableVertexAttribArray(vNormAttribLoc); // connect attrib to array
                vUVAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexUV"); // ptr to vertex UV attrib
                gl.enableVertexAttribArray(vUVAttribLoc); // connect attrib to array
                vTangentAttribLoc = gl.getAttribLocation(shaderProgram, "aTangent");
                gl.enableVertexAttribArray(vTangentAttribLoc);
                vBitangentAttribLoc = gl.getAttribLocation(shaderProgram, "aBitangent");
                gl.enableVertexAttribArray(vBitangentAttribLoc);
                vLineColorLoc = gl.getAttribLocation(shaderProgram, "aLineColor");
                gl.enableVertexAttribArray(vLineColorLoc);

                // locate vertex uniforms
                mMatrixULoc = gl.getUniformLocation(shaderProgram, "umMatrix"); // ptr to mmat
                pvmMatrixULoc = gl.getUniformLocation(shaderProgram, "upvmMatrix"); // ptr to pvmmat
                
                // locate fragment uniforms
                eyePositionULoc = gl.getUniformLocation(shaderProgram, "uEyePosition"); // ptr to eye position
                torchPositionULoc = gl.getUniformLocation(shaderProgram, "uTorchPosition");
                var lightAmbientULoc = gl.getUniformLocation(shaderProgram, "uLightAmbient"); // ptr to light ambient
                var lightDiffuseULoc = gl.getUniformLocation(shaderProgram, "uLightDiffuse"); // ptr to light diffuse
                var lightSpecularULoc = gl.getUniformLocation(shaderProgram, "uLightSpecular"); // ptr to light specular
                makeItYourOwnULoc = gl.getUniformLocation(shaderProgram, "uMIYOFlag");
                lightPositionULoc = gl.getUniformLocation(shaderProgram, "uLightPosition"); // ptr to light position
                lightPositionsULoc = gl.getUniformLocation(shaderProgram, "uLightPositions");
                numLightsULoc = gl.getUniformLocation(shaderProgram, "uNumLights");
                isFloorULoc = gl.getUniformLocation(shaderProgram, "uIsFloor");
                isNormalMappingEnabledULoc = gl.getUniformLocation(shaderProgram, "uIsNormalMappingEnabled");
                NormalExaggerationFactorULoc = gl.getUniformLocation(shaderProgram, "uNormalExaggerationFactor");
                ambientULoc = gl.getUniformLocation(shaderProgram, "uAmbient"); // ptr to ambient
                diffuseULoc = gl.getUniformLocation(shaderProgram, "uDiffuse"); // ptr to diffuse
                specularULoc = gl.getUniformLocation(shaderProgram, "uSpecular"); // ptr to specular
                shininessULoc = gl.getUniformLocation(shaderProgram, "uShininess"); // ptr to shininess
                alphaULoc = gl.getUniformLocation(shaderProgram, "uAlpha");
                usingTextureULoc = gl.getUniformLocation(shaderProgram, "uUsingTexture"); // ptr to using texture
                textureULoc = gl.getUniformLocation(shaderProgram, "uTexture"); // ptr to texture
                normalMapTextureULoc = gl.getUniformLocation(shaderProgram, "uNormalMapTexture"); // ptr to texture
                
                // pass global (not per model) constants into fragment uniforms
                gl.uniform3fv(eyePositionULoc,Eye); // pass in the eye's position
                gl.uniform3fv(torchPositionULoc,Eye);
                gl.uniform3fv(lightAmbientULoc,lightAmbient); // pass in the light's ambient emission
                gl.uniform3fv(lightDiffuseULoc,lightDiffuse); // pass in the light's diffuse emission
                gl.uniform3fv(lightSpecularULoc,lightSpecular); // pass in the light's specular emission
                gl.uniform1i(numLightsULoc, lightPositions.length);
                gl.uniform3fv(lightPositionsULoc, flattenVec3ToFloat32Array(lightPositions));
                gl.uniform1i(makeItYourOwnULoc,makeItYourOwnEnabled ? 1 : 0);
                gl.uniform1i(isFloorULoc, 0);
                gl.uniform1i(isNormalMappingEnabledULoc, 0);
                gl.uniform1f(NormalExaggerationFactorULoc, 1);
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

function getOscillatingValue() {
  // Increment the angle for the next call
  makeItYourOwnAngle += Math.PI / 10; // Adjust the step size to control oscillation speed

  // Return the oscillating value within the range +4 to 0
  const oscval = 30 * (1 + Math.sin(makeItYourOwnAngle)) / 2;
  return Math.round(oscval * 100)/100;
}

function flattenVec3ToFloat32Array(vec3Arr) {
  let float32arr = new Float32Array(vec3Arr.length * 3);
  
  for (let i = 0; i < lightPositions.length; i++) {
    float32arr.set(lightPositions[i], i * 3);
  }
  return float32arr;
}

function handleMakeItYourOwn() {
  const imageElement = document.getElementById("flameHand");
  if(makeItYourOwnEnabled) {
    imageElement.style.opacity = "1";
    imageElement.style.marginRight = `${getOscillatingValue()}px`;
  } else {
    imageElement.style.opacity = "0";
  }
}

function handleFrametimeHUD(timestamp) {
  //  Framerate logic
  if (lastTimestamp > 0) {
    const deltaTime = timestamp - lastTimestamp; // Time since last frame

    // Store recent frame times
    frametimes.push(deltaTime);
    if (frametimes.length > maxFrames) {
        frametimes.shift(); // Keep only last 10 frames
    }

    // Compute average frame time and FPS
    const avgFrameTime = frametimes.reduce((a, b) => a + b, 0) / frametimes.length;
    const fps = 1000 / avgFrameTime; // Convert ms to FPS

    if(timestamp - lastFPSUpdate > updateFPSEveryMS || lastFPSUpdate == 0) {
      // Update HUD display
      handleHUDElement("Frame time", `${avgFrameTime.toFixed(2)} ms`)
      handleHUDElement("FPS", `${fps.toFixed(1)}`);
      lastFPSUpdate = timestamp;
    }
  }
  lastTimestamp = timestamp; // Update last frame time
}

function isNormalMappingEnabled() {
  const enabledRadio = document.querySelector('input[name="normalMapping"]:checked');
  return enabledRadio && enabledRadio.value === 'enabled';
}

function unmarkRenderedInputTriangles() {
  inputTriangles.map((triangleSet) => triangleSet.isRendered = false);
}

function unmarkRenderedSpheres() {
  inputSpheres.map((sphere) => sphere.isRendered = false);
}

function renderModelsOG(timestamp) {
  handleFrametimeHUD(timestamp);
  hudRenderedTriangles = 0;
  handleVisibilityOfModels();
  handleTotalTrianglesCount();
  renderWithLOD();
  // construct the model transform matrix, based on model state
  function makeModelTransform(currModel) {
      var zAxis = vec3.create(), sumRotation = mat4.create(), temp = mat4.create(), negCenter = vec3.create();

      vec3.normalize(zAxis,vec3.cross(zAxis,currModel.xAxis,currModel.yAxis)); // get the new model z axis
      mat4.set(sumRotation, // get the composite rotation
          currModel.xAxis[0], currModel.yAxis[0], zAxis[0], 0,
          currModel.xAxis[1], currModel.yAxis[1], zAxis[1], 0,
          currModel.xAxis[2], currModel.yAxis[2], zAxis[2], 0,
          0, 0,  0, 1);
      vec3.negate(negCenter,currModel.center);
      mat4.multiply(sumRotation,sumRotation,mat4.fromTranslation(temp,negCenter)); // rotate * -translate
      mat4.multiply(sumRotation,mat4.fromTranslation(temp,currModel.center),sumRotation); // translate * rotate * -translate
      mat4.fromTranslation(mMatrix,currModel.translation); // translate in model matrix
      mat4.multiply(mMatrix,mMatrix,sumRotation); // rotate in model matrix
  } // end make model transform
  
  var hMatrix = mat4.create(); // handedness matrix
  var pMatrix = mat4.create(); // projection matrix
  var vMatrix = mat4.create(); // view matrix
  var mMatrix = mat4.create(); // model matrix
  var hpvMatrix = mat4.create(); // hand * proj * view matrices
  var hpvmMatrix = mat4.create(); // hand * proj * view * model matrices
  const HIGHLIGHTMATERIAL = 
      {ambient:[0.5,0.5,0], diffuse:[0.5,0.5,0], specular:[0,0,0], n:1, alpha:1, texture:false}; // hlht mat
  
  window.requestAnimationFrame(renderModelsOG); // set up frame render callback
  
  gl.clear(/*gl.COLOR_BUFFER_BIT |*/ gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers
  
  // set up handedness, projection and view
  mat4.fromScaling(hMatrix,vec3.fromValues(-1,1,1)); // create handedness matrix
  mat4.perspective(pMatrix,0.5*Math.PI,1,0.1,100); // create projection matrix
  mat4.lookAt(vMatrix,Eye,Center,Up); // create view matrix
  mat4.multiply(hpvMatrix,hMatrix,pMatrix); // handedness * projection
  mat4.multiply(hpvMatrix,hpvMatrix,vMatrix); // handedness * projection * view

  // render each triangle set
  var currSet, setMaterial; // the tri set and its material properties
  for (var whichTriSet=0; whichTriSet<numTriangleSets; whichTriSet++) {
      currSet = inputTriangles[whichTriSet];
      if(!currSet.visibility) continue;
      // make model transform, add to view project
      makeModelTransform(currSet);
      mat4.multiply(hpvmMatrix,hpvMatrix,mMatrix); // handedness * project * view * model
      gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in the m matrix
      gl.uniformMatrix4fv(pvmMatrixULoc, false, hpvmMatrix); // pass in the hpvm matrix
      
      // reflectivity: feed to the fragment shader
      if (inputTriangles[whichTriSet].on)
          setMaterial = HIGHLIGHTMATERIAL; // highlight material
      else
          setMaterial = currSet.material; // normal material
      gl.uniform3fv(ambientULoc,setMaterial.ambient); // pass in the ambient reflectivity
      gl.uniform3fv(diffuseULoc,setMaterial.diffuse); // pass in the diffuse reflectivity
      gl.uniform3fv(specularULoc,setMaterial.specular); // pass in the specular reflectivity
      gl.uniform1f(shininessULoc,setMaterial.n); // pass in the specular exponent
      gl.uniform1f(alphaULoc,setMaterial.alpha);

      gl.uniform1i(usingTextureULoc,(currSet.material.texture != false)); // whether the set uses texture
      gl.activeTexture(gl.TEXTURE0); // bind to active texture 0 (the first)
      gl.bindTexture(gl.TEXTURE_2D, textures[whichTriSet]); // bind the set's texture
      gl.uniform1i(textureULoc, 0); // pass in the texture and active texture 0
      
      gl.activeTexture(gl.TEXTURE1); // bind to active texture 0 (the first)
      gl.bindTexture(gl.TEXTURE_2D, normalMapsOfTextures[whichTriSet]); // bind the set's texture
      gl.uniform1i(normalMapTextureULoc, 1);
      gl.uniform1i(makeItYourOwnULoc,makeItYourOwnEnabled ? 1 : 0);
      gl.uniform3fv(eyePositionULoc,Eye); // pass in the eye's position
      gl.uniform3fv(torchPositionULoc, getTorchPosition(Eye, vMatrix));
      gl.uniform1i(isFloorULoc, currSet.isFloor ? 1 : 0);
      gl.uniform1i(isNormalMappingEnabledULoc, isNormalMappingEnabled() ? 1 : 0)
      gl.uniform1f(NormalExaggerationFactorULoc, normalMappingStrength);

      // position, normal and uv buffers: activate and feed into vertex shader
      gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichTriSet]); // activate position
      gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed
      gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichTriSet]); // activate normal
      gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed
      gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffers[whichTriSet]); // activate uv
      gl.vertexAttribPointer(vUVAttribLoc,2,gl.FLOAT,false,0,0); // feed
      gl.bindBuffer(gl.ARRAY_BUFFER,tangentBuffers[whichTriSet]);
      gl.vertexAttribPointer(vTangentAttribLoc,3,gl.FLOAT,false,0,0); // feed
      gl.bindBuffer(gl.ARRAY_BUFFER,bitangentBuffers[whichTriSet]);
      gl.vertexAttribPointer(vBitangentAttribLoc,3,gl.FLOAT,false,0,0); // feed
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffers[whichTriSet]);
      gl.vertexAttribPointer(vLineColorLoc, 3, gl.FLOAT, false, 0, 0);
      
      if(currSet.isFloor) {
        // triangle buffer: activate and render if we're rendering floor
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[whichTriSet]); // activate
        gl.drawElements(gl.TRIANGLES,3*triSetSizes[whichTriSet],gl.UNSIGNED_SHORT,0); // render
      } else {
        // else only render mesh
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,wireframeBuffers[whichTriSet]);
        gl.drawElements(gl.LINES, wireframeEdgeCount[whichTriSet], gl.UNSIGNED_SHORT, 0);
      }

      hudRenderedTriangles += currSet.triangles.length;
  } // end for each triangle set

  handleHUDElement("Rendered Triangles", hudRenderedTriangles);
} // end render model

/* MAIN -- HERE is where execution begins after window load */

function main() {
  
  setupWebGL(); // set up the webGL environment
  loadModels(); // load in the models from tri file
  setupShaders(); // setup the webGL shaders
  renderModelsOG(); // draw the triangles using webGL
  
} // end main

// ** LOD Code Starts here ** //
function arrayEqual(a, b) {
  if(a.length !== b.length) {
    return false;
  }

  for(var i=0; i<a.length; i++) {
    if(a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function integerEqual(a, b) {
  return a === b;
}

function filterSimilarCells(triangles, vertices) {
  var equal = integerEqual;
  if(vertices) {
    equal = arrayEqual;
  }

  return triangles.filter(function(cell) {
    if(vertices) {
      cell = cell.map(function(index) {
        return vertices[index];
      });
    }

    for(var i=0; i<cell.length; i++) {
      for(var j=0; j<cell.length; j++) {
        if(i != j && equal(cell[i], cell[j])) {
          return false;
        }
      }
    }
    return true;
  });
}

function removeOrphanVertices(triangles, vertices) {
  var newPositions = [];
  var indexLookup = {};

  var newCells = triangles.map(function(cell) {
    return cell.map(function(index) {
      if(indexLookup[index] === undefined) {
        indexLookup[index] = newPositions.length;
        newPositions.push(vertices[index]);
      }
      return indexLookup[index];
    });
  });

  return {
    triangles: newCells,
    vertices: newPositions
  };
}

var DEFAULT_NORMALS_EPSILON = 1e-6;
var DEFAULT_FACE_EPSILON = 1e-6;

function vertexNormalsFn(faces, positions, specifiedEpsilon) {

  var N         = positions.length;
  var normals   = new Array(N);
  var epsilon   = specifiedEpsilon === void(0) ? DEFAULT_NORMALS_EPSILON : specifiedEpsilon;

  //Initialize normal array
  for(var i=0; i<N; ++i) {
    normals[i] = [0.0, 0.0, 0.0];
  }

  //Walk over all the faces and add per-vertex contribution to normal weights
  for(var i=0; i<faces.length; ++i) {
    var f = faces[i];
    var p = 0;
    var c = f[f.length-1];
    var n = f[0];
    for(var j=0; j<f.length; ++j) {

      //Shift indices back
      p = c;
      c = n;
      n = f[(j+1) % f.length];

      var v0 = positions[p];
      var v1 = positions[c];
      var v2 = positions[n];

      //Compute infineteismal arcs
      var d01 = new Array(3);
      var m01 = 0.0;
      var d21 = new Array(3);
      var m21 = 0.0;
      for(var k=0; k<3; ++k) {
        d01[k] = v0[k]  - v1[k];
        m01   += d01[k] * d01[k];
        d21[k] = v2[k]  - v1[k];
        m21   += d21[k] * d21[k];
      }

      //Accumulate values in normal
      if(m01 * m21 > epsilon) {
        var norm = normals[c];
        var w = 1.0 / Math.sqrt(m01 * m21);
        for(var k=0; k<3; ++k) {
          var u = (k+1)%3;
          var v = (k+2)%3;
          norm[k] += w * (d21[u] * d01[v] - d21[v] * d01[u]);
        }
      }
    }
  }

  //Scale all normals to unit length
  for(var i=0; i<N; ++i) {
    var norm = normals[i];
    var m = 0.0;
    for(var k=0; k<3; ++k) {
      m += norm[k] * norm[k];
    }
    if(m > epsilon) {
      var w = 1.0 / Math.sqrt(m);
      for(var k=0; k<3; ++k) {
        norm[k] *= w;
      }
    } else {
      for(var k=0; k<3; ++k) {
        norm[k] = 0.0;
      }
    }
  }

  //Return the resulting set of patches
  return normals;
}

function faceNormalsFn (faces, positions, specifiedEpsilon) {

  var N         = faces.length;
  var normals   = new Array(N);
  var epsilon   = specifiedEpsilon === void(0) ? DEFAULT_FACE_EPSILON : specifiedEpsilon;

  for(var i=0; i<N; ++i) {
    var f = faces[i];
    var pos = new Array(3);
    for(var j=0; j<3; ++j) {
      pos[j] = positions[f[j]];
    }

    var d01 = new Array(3);
    var d21 = new Array(3);
    for(var j=0; j<3; ++j) {
      d01[j] = pos[1][j] - pos[0][j];
      d21[j] = pos[2][j] - pos[0][j];
    }

    var n = new Array(3);
    var l = 0.0;
    for(var j=0; j<3; ++j) {
      var u = (j+1)%3;
      var v = (j+2)%3;
      n[j] = d01[u] * d21[v] - d01[v] * d21[u];
      l += n[j] * n[j];
    }
    if(l > epsilon) {
      l = 1.0 / Math.sqrt(l);
    } else {
      l = 0.0;
    }
    for(var j=0; j<3; ++j) {
      n[j] *= l;
    }
    normals[i] = n;
  }
  return normals;
}

function vertexError(vertex, quadratic) {
  var xformed = new Array(4);
  vec4.transformMat4(xformed, vertex, quadratic);
  return vec4.dot(vertex, xformed);
};

function optimalPosition(v1, v2) {
  var q1 = v1.error;
  var q2 = v2.error;
  var costMatrix = ndarray(new Float32Array(4 * 4), [4, 4]);
  ops.add(costMatrix, q1, q2);
  var mat4Cost = Array.from(costMatrix.data);
  var optimal = ndarray(new Float32Array(4));
  var toInvert = costMatrix;
  toInvert.set(0, 3, 0);
  toInvert.set(1, 3, 0);
  toInvert.set(2, 3, 0);
  toInvert.set(3, 3, 1);
  var solved = solve(optimal, toInvert, ndarray([0, 0, 0, 1]));

  if (!solved) {
    var v1Homogenous = Array.from(v1.position);
    v1Homogenous.push(1);
    var v2Homogenous = Array.from(v2.position);
    v2Homogenous.push(1);
    var midpoint = vec3.add(new Array(3), v1.position, v2.position);
    vec3.scale(midpoint, midpoint, 0.5);
    midpoint.push(1);
    var v1Error = vertexError(v1Homogenous, mat4Cost);
    var v2Error = vertexError(v2Homogenous, mat4Cost);
    var midpointError = vertexError(midpoint, mat4Cost);
    var minimum = Math.min([v1Error, v2Error, midpointError]);
    if (v1Error == minimum) {
      optimal = v1Homogenous;
    } else if (v2Error == minimum) {
      optimal = v2Homogenous;
    } else {
      optimal = midpoint;
    }
  } else {
    optimal = optimal.data;
  }

  var error = vertexError(optimal, mat4Cost);
  return {vertex: optimal.slice(0, 3), error: error};
};

function simplifyMeshOptimized(cells, positions, faceNormals, threshold = 0) {
  cells = filterSimilarCells(cells);

  if (!faceNormals) {
    faceNormals = faceNormalsFn(cells, positions);
  }

  var n = positions.length;
  var vertices = positions.map(function(p, i) {
    return {
      position: p,
      index: i,
      pairs: [],
      error: ndarray(new Float32Array(4 * 4).fill(0), [4, 4])
    }
  });

  cells.map(function(cell) {
    for (var i = 0; i < 2; i++) {
      var j = (i + 1) % 3;
      var v1 = cell[i];
      var v2 = cell[j];
      // consistent ordering to prevent double entries
      if (v1 < v2) {
        vertices[v1].pairs.push(v2);
      } else {
        vertices[v2].pairs.push(v1);
      }
    }
  });

  if (threshold > 0) {
    for (var i = 0; i < n; i++) {
      for (var j = i - 1; j >= 0; j--) {
        if (vec3.distance(cells[i], cells[j]) < threshold) {
          if (i < j) {
            vertices[i].pairs.push(vertices[j]);
          } else {
            vertices[j].pairs.push(vertices[i]);
          }
        }
      }
    }
  }

  cells.map(function(cell, cellId) {
    var normal = faceNormals[cellId];
    // [a, b, c, d] where plane is defined by a*x+by+cz+d=0
    // choose the first vertex WLOG
    var pointOnTri = positions[cell[0]];
    var plane = [normal[0], normal[1], normal[2], -vec3.dot(normal, pointOnTri)];

    cell.map(function(vertexId) {
      var errorQuadric = ndarray(new Float32Array(4 * 4), [4, 4]);
      for (var i = 0; i < 4; i++) {
        for (var j = i; j >= 0; j--) {
          var value = plane[i] * plane[j];
          errorQuadric.set(i, j, value);
          if (i != j) {
            errorQuadric.set(j, i, value);
          }
        }
      }

      var existingQuadric = vertices[vertexId].error;
      ops.add(existingQuadric, existingQuadric, errorQuadric);
    })
  });

  var costs = new Heap(function(a, b) {
    return a.cost - b.cost;
  });

  var edges = []
  vertices.map(function(v1) {
    v1.pairs.map(function(v2Index) {
      var v2 = vertices[v2Index];
      var optimal = optimalPosition(v1, v2);

      var edge = {
        pair: [v1.index, v2Index],
        cost: optimal.error,
        optimalPosition: optimal.vertex
      };

      costs.push(edge);
      // to update costs
      edges.push(edge);
    });
  });

  var n = positions.length;
  return function(targetCount) {
    // deep-copy trick: https://stackoverflow.com/questions/597588/how-do-you-clone-an-array-of-objects-in-javascript
    var newCells = JSON.parse(JSON.stringify(cells));
    var deletedCount = 0;

    while (n - deletedCount > targetCount) {
      var leastCost = costs.pop();

      // cannot collapse anymore
      if(leastCost == undefined || leastCost == null) break;
      var i1 = leastCost.pair[0];
      var i2 = leastCost.pair[1];
      if (i1 == i2) {
        // edge has already been collapsed
        continue;
      }
      vertices[i1].position = leastCost.optimalPosition;

      for (var i = newCells.length - 1; i >= 0; i--) {
        var cell = newCells[i];
        var cellIndex2 = cell.indexOf(i2);
        if (cellIndex2 != -1) {
          if (cell.indexOf(i1) != -1) {
            // Delete cells with zero area, as v1 == v2 now
            newCells.splice(i, 1);
          }

          cell[cellIndex2] = i1;
        }
      }

      var v1 = vertices[i1];
      edges.map(function(edge, i) {
        var edgeIndex1 = edge.pair.indexOf(i1);
        var edgeIndex2 = edge.pair.indexOf(i2);

        if (edgeIndex1 != -1 && edgeIndex2 != -1) {
          edge.pair[edgeIndex2] = i1;
          return;
        }

        if (edge.pair.indexOf(i1) != -1) {
          var optimal = optimalPosition(v1, vertices[edge.pair[(edgeIndex1 + 1) % 2]]);
          edge.optimalPosition = optimal.vertex;
          edge.cost = optimal.error;
        }

        if (edge.pair.indexOf(i2) != -1) {
          // use v1 as that is the new position of v2
          var optimal = optimalPosition(v1, vertices[edge.pair[(edgeIndex2 + 1) % 2]]);
          edge.pair[edgeIndex2] = i1;
          edge.optimalPosition = optimal.vertex;
          edge.cost = optimal.error;
        }
      });

      costs.heapify();
      deletedCount++;
    }

    return removeOrphanVertices(newCells, vertices.map(function(p) {
      return p.position
    }));
  };
}

function addDistinctLineColors(model) {
  // HSV to RGB conversion (same as before)
  function HSVtoRGB(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    
    return [r, g, b];
  }

  const colors = [];
  const goldenRatio = 0.618033988749895;
  
  // For wireframe, we'll color each edge (2 vertices per line)
  for (let i = 0; i < model.glWireFrameIndices.length / 2; i++) {
    const hue = (i * goldenRatio) % 1.0;
    // const color = HSVtoRGB(hue, 0.8, 0.9);
    const color = [1.0,0.0,0.0];
    
    // Add same color for both vertices of the line
    colors.push(color, color);
  }
  
  return {
    ...model,
    lineColors: colors
  };
}