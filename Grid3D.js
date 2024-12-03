import * as THREE from 'three';

const DIVS = 4;
const SIZE = 4;

function buildGridGeometry() {
	const vertices = [];

	const size = 1;
	const divs = DIVS;
	const step = size / divs;

	for ( let i = 0; i <= divs; i ++) {
		for ( let j = 0; j <= divs; j ++) {
			vertices.push(j * step, i * step, 0);
			vertices.push(j * step, i * step, size);

			vertices.push(0, i * step, j * step);
			vertices.push(size, i * step, j * step);

			vertices.push(i * step, 0, j * step);
			vertices.push(i * step, size, j * step);

		}
	}

	return vertices;
}

export class LoDGrid3DManager {
	#totalCellNb;
	#nbLoDs;
	#mesh;
	#scene;
	#lodOffsets = [];
	#instanceMatrix;
	#visibleCells = [];
	
	constructor(nbLoDs = 1) {
		this.#nbLoDs = nbLoDs;
		this.#totalCellNb = Math.pow(Math.pow(DIVS, 3), nbLoDs - 1);
		this.#totalCellNb = 0;
		for(let lod = 0; lod < this.#nbLoDs; ++lod) {
			this.#lodOffsets.push(this.#totalCellNb);
			this.#totalCellNb += Math.pow(Math.pow(DIVS, 3), lod);
		}

		const gridGeometry = new THREE.InstancedBufferGeometry();
		gridGeometry.instanceCount = this.#totalCellNb;
		gridGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( buildGridGeometry(), 3 ) );

		this.#instanceMatrix = new Float32Array(this.#totalCellNb * 16);
		const matrix = new THREE.Matrix4();
		const position = new THREE.Vector3();
   		const rotation = new THREE.Quaternion()
		const scale = new THREE.Vector3(0, 0, 0);
		for(let i = 0; i < this.#totalCellNb; ++i) {
			matrix.compose(position, rotation, scale);
			matrix.toArray(this.#instanceMatrix, i*16);
		}
		gridGeometry.setAttribute('instanceMatrix', new THREE.InstancedBufferAttribute(this.#instanceMatrix, 16));

		const gridMaterial = new THREE.LineBasicMaterial({color: 0x000000, linewidth: 1,
			onBeforeCompile: shader => {
				shader.vertexShader = `
				attribute mat4 instanceMatrix;

				${shader.vertexShader}
			`.replace(
				  `#include <begin_vertex>`,
				  `#include <begin_vertex>
				  transformed = (instanceMatrix * vec4(position, 1)).xyz;
			`
				);
			  }
		});
		gridGeometry.attributes.instanceMatrix.needsUpdate = true
		this.#mesh = new THREE.LineSegments(gridGeometry, gridMaterial);

		gridGeometry.instanceCount = 0
	}

	addTo(scene) {
		this.#scene = scene;
		this.#scene.add(this.#mesh);
	}

	remove() {
		this.#scene.remove(this.#mesh);
	}

	#voxelId(cell, lod) {
		return cell.x + Math.pow(4, lod) * cell.y + Math.pow(Math.pow(4, lod), 2) * cell.z;
	}

	showCell(lod = 0, cell = new THREE.Vector3(0, 0, 0)) {
		const offset = this.#lodOffsets[lod];
		const id = this.#voxelId(cell, lod);

   		const rotation = new THREE.Quaternion();

		const size = SIZE / Math.pow(4, lod);
		const scale = new THREE.Vector3(size, size, size);

		const position = new THREE.Vector3(
			cell.x * size,
			cell.y * size,
			cell.z * size
		);

		const matId = this.#visibleCells.length;
		this.#visibleCells.push(id + offset);

		const matrix = new THREE.Matrix4();
		matrix.compose(position, rotation, scale);
		matrix.toArray(this.#instanceMatrix, matId*16);

	}

	update() {
		this.#mesh.geometry.attributes.instanceMatrix.needsUpdate = true
		this.#mesh.geometry.instanceCount = this.#visibleCells.length;
	}

	hideCell(lod = 0, cell = new THREE.Vector3(0, 0, 0)) {
		const offset = this.#lodOffsets[lod];
		const id = this.#voxelId(cell, lod);
		const matrix = new THREE.Matrix4().multiplyScalar(0);
		matrix.toArray(this.#instanceMatrix, (id + offset)*16);

		this.#mesh.geometry.attributes.instanceMatrix.needsUpdate = true
	}

	reset() {
		const matrix = new THREE.Matrix4().multiplyScalar(0);
		this.#visibleCells.length = 0;
		for(let i = 0; i < this.#totalCellNb; ++i) {
			matrix.toArray(this.#instanceMatrix, i*16);
		}
	}
}