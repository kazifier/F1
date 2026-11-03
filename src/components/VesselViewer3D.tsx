import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface NozzleSpec {
  nps: string;
  od: number;
  wall: number;
  /** 0..1 along the shell */
  position: number;
  /** degrees around the vessel */
  angle: number;
  projection: number;
}

export interface ViewerProps {
  shellId: number; // mm
  shellThk: number; // mm
  shellLength: number; // mm
  headType: string;
  orientation: "Vertical" | "Horizontal";
  nozzles: NozzleSpec[];
  skirtHeight: number; // mm
  saddles: number;
  ladder: boolean;
}

const SCALE = 1 / 1000; // mm -> scene units (metres)

export default function VesselViewer3D(props: ViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [spin, setSpin] = useState(true);
  const stateRef = useRef({ spin: true, wireframe: false });

  useEffect(() => {
    stateRef.current.spin = spin;
    stateRef.current.wireframe = wireframe;
    const group = groupRef.current;
    if (group) {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat) mat.wireframe = wireframe;
        }
      });
    }
  }, [spin, wireframe]);

  const groupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef3f8");
    scene.fog = new THREE.Fog("#eef3f8", 26, 70);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 60;
    controls.autoRotateSpeed = 1.1;

    // lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b6c4, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(6, 10, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.9);
    rim.position.set(-8, 4, -6);
    scene.add(rim);

    const grid = new THREE.GridHelper(30, 30, 0x9fb2c4, 0xd3dde6);
    grid.position.y = 0;
    scene.add(grid);

    const group = new THREE.Group();
    groupRef.current = group;
    scene.add(group);

    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xcdd8e2,
      metalness: 0.55,
      roughness: 0.42,
      side: THREE.DoubleSide,
    });
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0xe8a33d,
      metalness: 0.7,
      roughness: 0.35,
    });
    const flangeMat = new THREE.MeshStandardMaterial({
      color: 0xcf6b4a,
      metalness: 0.75,
      roughness: 0.4,
    });
    const supportMat = new THREE.MeshStandardMaterial({
      color: 0x6f8aa3,
      metalness: 0.5,
      roughness: 0.6,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x7fb6d6,
      metalness: 0.2,
      roughness: 0.5,
      transparent: true,
      opacity: 0.22,
    });

    const R = (props.shellId / 2) * SCALE;
    const t = Math.max(props.shellThk * SCALE, 0.008);
    const L = props.shellLength * SCALE;
    const Ro = R + t;

    // --- shell -------------------------------------------------------------
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(Ro, Ro, L, 64, 1, true), shellMat);
    group.add(shell);
    // inner surface hint
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 48, 1, true), glassMat);
    group.add(inner);

    // --- heads -------------------------------------------------------------
    const addHead = (dir: 1 | -1) => {
      const y = (dir * L) / 2;
      if (props.headType.includes("Flat")) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(Ro, Ro, t * 2, 64), shellMat);
        plate.position.y = y + dir * t;
        group.add(plate);
        return;
      }
      const depthFactor = props.headType.includes("Hemispherical")
        ? 0.5
        : props.headType.includes("Torispherical")
          ? 0.2
          : props.headType.includes("Conical")
            ? 0.5
            : 0.25; // 2:1 ellipsoidal
      const geo = new THREE.SphereGeometry(Ro, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2);
      const head = new THREE.Mesh(geo, shellMat);
      head.scale.set(1, depthFactor, 1);
      head.position.y = y;
      if (dir === -1) head.rotation.x = Math.PI;
      if (props.headType.includes("Conical")) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(Ro, R * 1.2, 48, 1, true), shellMat);
        cone.position.y = y + dir * R * 0.6;
        if (dir === -1) cone.rotation.x = Math.PI;
        group.add(cone);
      } else {
        group.add(head);
      }
      // straight flange
      const sf = new THREE.Mesh(new THREE.CylinderGeometry(Ro, Ro, 0.04, 64, 1, true), shellMat);
      sf.position.y = y;
      group.add(sf);
    };
    addHead(1);
    addHead(-1);

    // --- nozzles -----------------------------------------------------------
    for (const nz of props.nozzles) {
      const nr = (nz.od / 2) * SCALE;
      const nlen = (nz.projection || 150) * SCALE;
      const geoSide = new THREE.CylinderGeometry(nr, nr, nlen, 20, 1, true);
      const nozz = new THREE.Mesh(geoSide, nozzleMat);
      const theta = (nz.angle * Math.PI) / 180;
      const yPos = -L / 2 + nz.position * L;
      nozz.position.set(Math.cos(theta) * (Ro + nlen / 2), yPos, Math.sin(theta) * (Ro + nlen / 2));
      nozz.rotation.z = -Math.PI / 2;
      nozz.rotation.y = -theta;
      group.add(nozz);

      // flange
      const fg = new THREE.Mesh(
        new THREE.CylinderGeometry(nr * 1.75, nr * 1.75, 0.028, 24),
        flangeMat,
      );
      fg.position.set(
        Math.cos(theta) * (Ro + nlen + 0.014),
        yPos,
        Math.sin(theta) * (Ro + nlen + 0.014),
      );
      fg.rotation.z = -Math.PI / 2;
      fg.rotation.y = -theta;
      group.add(fg);

      // reinforcement pad
      const pad = new THREE.Mesh(new THREE.TorusGeometry(nr * 1.9, 0.012, 8, 28), flangeMat);
      pad.position.set(Math.cos(theta) * Ro, yPos, Math.sin(theta) * Ro);
      pad.rotation.y = -theta + Math.PI / 2;
      pad.rotation.x = Math.PI / 2;
      group.add(pad);
    }

    // --- supports ----------------------------------------------------------
    let baseY = -L / 2;
    if (props.skirtHeight > 0) {
      const skH = props.skirtHeight * SCALE;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(Ro, Ro * 1.02, skH, 64, 1, true), supportMat);
      skirt.position.y = -L / 2 - skH / 2;
      group.add(skirt);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(Ro * 1.14, Ro * 1.14, 0.03, 48), supportMat);
      ring.position.y = -L / 2 - skH;
      group.add(ring);
      baseY = -L / 2 - skH;
    } else if (props.saddles > 0) {
      const h = 0.6;
      for (const frac of props.saddles === 1 ? [0.5] : [0.22, 0.78]) {
        const y = -L / 2 + frac * L;
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, Ro * 1.5), supportMat);
        web.position.set(-Ro - 0.02, y - (R + h) / 2 + 0.1, 0);
        group.add(web);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, Ro * 1.9), supportMat);
        base.position.set(-Ro - 0.02, y - R - h + 0.1, 0);
        group.add(base);
      }
      baseY = -R - 0.55;
    }

    // --- ladder / platform -------------------------------------------------
    if (props.ladder) {
      const ladderX = Ro + 0.07;
      const railGeo = new THREE.CylinderGeometry(0.012, 0.012, L * 0.92, 8);
      for (const dz of [-0.14, 0.14]) {
        const rail = new THREE.Mesh(railGeo, supportMat);
        rail.position.set(ladderX, 0, dz);
        group.add(rail);
      }
      const rungGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.28, 6);
      const nRungs = Math.max(2, Math.floor(L / 0.3));
      for (let i = 0; i < nRungs; i++) {
        const rung = new THREE.Mesh(rungGeo, supportMat);
        rung.rotation.x = Math.PI / 2;
        rung.position.set(ladderX, -L * 0.46 + (i * L * 0.92) / nRungs, 0);
        group.add(rung);
      }
    }

    // centre everything vertically
    group.position.y = -baseY / 2;

    // --- orientation + camera ---------------------------------------------
    if (props.orientation === "Horizontal") {
      group.rotation.z = Math.PI / 2;
    }

    const totalH = Math.max(L, 1) + Ro * 2;
    const dist = totalH * 1.25 + 2;
    camera.position.set(dist * 0.75, dist * 0.45, dist * 0.8);
    controls.target.set(0, 0, 0);
    controls.autoRotate = stateRef.current.spin;
    controls.update();

    // --- loop --------------------------------------------------------------
    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const dt = clock.getDelta();
      void dt;
      controls.autoRotate = stateRef.current.spin;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      groupRef.current = null;
    };
  }, [
    props.shellId,
    props.shellThk,
    props.shellLength,
    props.headType,
    props.orientation,
    props.nozzles,
    props.skirtHeight,
    props.saddles,
    props.ladder,
  ]);

  return (
    <div className="viewer3d">
      <div ref={mountRef} className="viewer3d-canvas" />
      <div className="viewer3d-hud">
        <button className="btn btn-ghost" onClick={() => setSpin((v) => !v)}>
          {spin ? "Pause orbit" : "Orbit"}
        </button>
        <button className="btn btn-ghost" onClick={() => setWireframe((v) => !v)}>
          {wireframe ? "Shaded" : "Wireframe"}
        </button>
        <span className="viewer3d-tag">drag to rotate · scroll to zoom</span>
      </div>
    </div>
  );
}
