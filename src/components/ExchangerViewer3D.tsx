import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ExchangerDesign, ExchangerSpec } from "../lib/tema";
import type { HeNozzleRow } from "../lib/types";

const S = 1 / 1000; // mm -> scene metres

export interface ExchangerViewerProps {
  tag: string;
  name: string;
  spec: ExchangerSpec;
  design: ExchangerDesign;
  nozzles: HeNozzleRow[];
}

const npsOd = (nps: string) => {
  const inch = parseFloat(String(nps).replace(/[^0-9.]/g, "")) || 4;
  return inch * 25.4 * 1.06;
};

/** nozzle anchor by service name — shell and channel openings sit where TEMA puts them */
function anchorFor(service: string, i: number): { x: number; angle: number } {
  const s = (service ?? "").toLowerCase();
  if (s.includes("shell") && s.includes("inlet")) return { x: -0.3, angle: 90 };
  if (s.includes("shell") && s.includes("outlet")) return { x: 0.3, angle: 270 };
  if (s.includes("channel") && s.includes("inlet")) return { x: -1.06, angle: 90 };
  if (s.includes("channel") && s.includes("outlet")) return { x: 1.06, angle: 270 };
  if (s.includes("vent")) return { x: -0.34, angle: 90 };
  if (s.includes("drain")) return { x: 0.34, angle: 270 };
  return { x: -0.1 + ((i * 0.17) % 1), angle: i % 2 === 0 ? 90 : 270 };
}

export default function ExchangerViewer3D({ tag, name, spec, design, nozzles }: ExchangerViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [spin, setSpin] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [section, setSection] = useState(false);
  const [tubes, setTubes] = useState(true);
  const stateRef = useRef({ spin: true, wireframe: false, section: false, tubes: true });
  const shellRef = useRef<THREE.Mesh[]>([]);
  const bundleRef = useRef<THREE.Object3D[]>([]);

  stateRef.current.spin = spin;
  stateRef.current.wireframe = wireframe;
  stateRef.current.section = section;
  stateRef.current.tubes = tubes;

  const sig = [
    tag,
    design.kind,
    design.shellId,
    design.shellThk,
    design.tubesheetThk,
    design.baffleCount,
    design.bundleDia,
    design.tubesTotal,
    spec.tubeLength,
    spec.shells,
    spec.tubeOd,
    spec.pitch,
    spec.pattern,
    spec.tema,
    nozzles.length,
    design.heater?.coilTubes ?? 0,
    design.heater?.stackDia ?? 0,
  ].join("|");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef3f8");
    scene.fog = new THREE.Fog("#eef3f8", 30, 90);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 80;
    controls.autoRotateSpeed = 1.1;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b6c4, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(8, 12, 9);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.9);
    rim.position.set(-9, 5, -7);
    scene.add(rim);

    const grid = new THREE.GridHelper(40, 40, 0x9fb2c4, 0xd3dde6);
    grid.position.y = -3;
    scene.add(grid);

    const group = new THREE.Group();
    scene.add(group);

    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xcdd8e2,
      metalness: 0.55,
      roughness: 0.42,
      side: THREE.DoubleSide,
      clippingPlanes: [clip],
    });
    const channelMat = new THREE.MeshStandardMaterial({
      color: 0xb9c7d4,
      metalness: 0.6,
      roughness: 0.4,
      side: THREE.DoubleSide,
      clippingPlanes: [clip],
    });
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, metalness: 0.7, roughness: 0.35 });
    const flangeMat = new THREE.MeshStandardMaterial({ color: 0xcf6b4a, metalness: 0.75, roughness: 0.4 });
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x8fb6c9, metalness: 0.8, roughness: 0.3 });
    const baffleMat = new THREE.MeshStandardMaterial({
      color: 0x7f93a6,
      metalness: 0.45,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x6f8aa3, metalness: 0.5, roughness: 0.6 });

    const R = (design.shellId / 2) * S;
    const t = Math.max(design.shellThk * S, 0.006);
    const Ro = R + t;
    const L = spec.tubeLength * S;
    const tsT = Math.max(design.tubesheetThk * S, 0.01);
    const shellMeshes: THREE.Mesh[] = [];
    const bundleParts: THREE.Object3D[] = [];

    const addCylX = (
      radius: number,
      length: number,
      x: number,
      mat: THREE.Material,
      open = true,
      y = 0,
      z = 0,
    ) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 56, 1, open), mat);
      m.rotation.z = Math.PI / 2;
      m.position.set(x, y, z);
      group.add(m);
      return m;
    };

    /** fit the whole assembly in view, whatever its proportions */
    const frameScene = (pad = 1.02) => {
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const radius = Math.max(size.length() / 2, 0.6);
      const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * pad;
      const dir = new THREE.Vector3(0.78, 0.46, 0.85).normalize();
      controls.target.copy(centre);
      camera.position.copy(centre).addScaledVector(dir, dist);
      controls.minDistance = radius * 0.4;
      controls.maxDistance = dist * 4;
      camera.updateProjectionMatrix();
      controls.update();
    };

    if (design.kind === "fired-heater") {
      // --- fired heater: casing, coil, stack, burners --------------------------
      const heater = design.heater;
      const w = 3.4;
      const d = 2.6;
      const h = 4.2;
      const furnace = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.92, h * 0.9, d * 0.92),
        new THREE.MeshStandardMaterial({ color: 0x1c2732, metalness: 0.2, roughness: 0.9 }),
      );
      furnace.position.y = h / 2 - 1.6;
      group.add(furnace);
      const casing = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          color: 0xc26a3c,
          metalness: 0.4,
          roughness: 0.7,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          clippingPlanes: [clip],
        }),
      );
      casing.position.copy(furnace.position);
      group.add(casing);
      // casing edges so the box still reads as a welded steel shell
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(casing.geometry), new THREE.LineBasicMaterial({ color: 0x8a4a2c })).translateY(furnace.position.y));
      const coil = Math.min(heater?.coilTubes ?? 40, 120);
      for (let i = 0; i < coil; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w * 0.78, 10), tubeMat);
        c.rotation.z = Math.PI / 2;
        c.position.set(0, -1.4 + (i % 12) * 0.24, -d * 0.3 + Math.floor(i / 12) * 0.22);
        group.add(c);
      }
      const stackR = ((heater?.stackDia ?? 1200) * S) / 2;
      // keep the stack in proportion with the casing so the model stays readable
      const stackH = Math.min(Math.max((heater?.stackHeight ?? 6000) * S, 1.4), h);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(stackR, stackR, stackH, 40, 1, true), shellMat);
      stack.position.set(0, h - 1.6 + stackH / 2 - 0.1, -d * 0.12);
      group.add(stack);
      for (let b = 0; b < Math.min(heater?.burners ?? 4, 8); b++) {
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 20), nozzleMat);
        burner.position.set(-w * 0.36 + b * 0.32, -1.85, d * 0.28);
        group.add(burner);
      }
      shellRef.current = [casing];
      bundleRef.current = [];
      frameScene();
    } else {
      // --- shells: one for E/F/G/H, two legs for a bayonet, kettle gets a vapour space
      const shells = design.kind === "bayonet" ? 2 : 1;
      const zOff = shells === 2 ? [-(Ro + 0.18), Ro + 0.18] : [0];
      for (const z of zOff) {
        const shell = addCylX(Ro, L, 0, shellMat, true, 0, z);
        shellMeshes.push(shell);
      }
      if (design.kind === "kettle") {
        const vap = addCylX(Ro * 0.62, L * 0.92, 0, channelMat, true, Ro * 0.95, 0);
        shellMeshes.push(vap);
      }

      // --- tubesheets ---------------------------------------------------------
      for (const dir of [-1, 1]) {
        addCylX(R, tsT, (dir * L) / 2, channelMat, false);
      }

      // --- tube bundle --------------------------------------------------------
      const rt = (spec.tubeOd / 2) * S;
      const rb = (design.bundleDia / 2) * S * 0.94;
      const pitch = spec.pitch * S;
      const dy = spec.pattern === "30" ? pitch * 0.866 : pitch;
      const pts: { y: number; z: number }[] = [];
      for (let y = -rb + rt; y <= rb - rt; y += dy) {
        for (let z = -rb + rt; z <= rb - rt; z += pitch) {
          if (y * y + z * z <= (rb - rt) * (rb - rt)) pts.push({ y, z });
        }
      }
      const count = Math.min(pts.length, 700);
      if (count > 0) {
        const tubeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(rt, rt, L * 0.985, 8), tubeMat, count);
        const mtx = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
        const one = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < count; i++) {
          mtx.compose(new THREE.Vector3(0, pts[i].y, pts[i].z), q, one);
          tubeMesh.setMatrixAt(i, mtx);
        }
        tubeMesh.instanceMatrix.needsUpdate = true;
        group.add(tubeMesh);
        bundleParts.push(tubeMesh);
      }

      // --- baffles ------------------------------------------------------------
      const baffles = Math.min(design.baffleCount, 14);
      for (let i = 0; i < baffles; i++) {
        const x = -L / 2 + ((i + 1) * L) / (baffles + 1);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(rb * 1.02, 36, 0, Math.PI * 1.55), baffleMat);
        disc.rotation.y = Math.PI / 2;
        disc.position.set(x, 0, 0);
        group.add(disc);
        bundleParts.push(disc);
      }

      // --- channel (front head) and rear head ---------------------------------
      const chLen = Math.max(0.32, R * 0.9);
      const chX = L / 2 + tsT + chLen / 2;
      addCylX(R, chLen, chX, channelMat, true);
      const headMat = channelMat;
      const dish = (x: number, dir: 1 | -1) => {
        const geo = new THREE.SphereGeometry(R, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2);
        const head = new THREE.Mesh(geo, headMat);
        head.scale.set(1, 0.55, 1);
        head.rotation.z = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
        head.position.set(x, 0, 0);
        group.add(head);
      };
      dish(chX + chLen / 2, 1);

      const fixed = /^[A-Z][A-Z][MN]/.test(spec.tema.toUpperCase());
      const rearLen = fixed ? 0 : Math.max(0.3, R * 0.8);
      if (rearLen > 0) {
        const rx = -L / 2 - tsT - rearLen / 2;
        addCylX(R, rearLen, rx, channelMat, true);
        dish(rx - rearLen / 2, -1);
        // floating-head cover inside the shell end
        addCylX(R * 0.9, 0.06, -L / 2 + 0.12, baffleMat, false);
      } else {
        dish(-L / 2 - tsT, -1);
      }

      // --- nozzles ------------------------------------------------------------
      nozzles.slice(0, 14).forEach((nz, i) => {
        const a = anchorFor(nz.service, i);
        const od = npsOd(nz.nps);
        const nr = Math.max((od / 2) * S, 0.02);
        const nlen = 0.24 + nr;
        const inChannel = Math.abs(a.x) > 0.9;
        const x = inChannel ? (a.x > 0 ? chX : -L / 2 - (fixed ? 0 : rearLen / 2)) : a.x * L;
        const theta = (a.angle * Math.PI) / 180;
        const baseR = inChannel ? R + t : Ro;
        const px = x;
        const py = Math.cos(theta) * (baseR + nlen / 2);
        const pz = Math.sin(theta) * (baseR + nlen / 2);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(nr, nr, nlen, 18, 1, true), nozzleMat);
        neck.position.set(px, py, pz);
        neck.lookAt(px, py * 2, pz * 2);
        neck.rotateX(Math.PI / 2);
        group.add(neck);

        const fl = new THREE.Mesh(new THREE.CylinderGeometry(nr * 1.8, nr * 1.8, 0.03, 24), flangeMat);
        fl.position.set(px, Math.cos(theta) * (baseR + nlen), Math.sin(theta) * (baseR + nlen));
        fl.lookAt(px, Math.cos(theta) * (baseR + nlen) * 2, Math.sin(theta) * (baseR + nlen) * 2);
        fl.rotateX(Math.PI / 2);
        group.add(fl);

        const pad = new THREE.Mesh(new THREE.TorusGeometry(nr * 1.5, 0.01, 8, 18), flangeMat);
        pad.position.set(px, Math.cos(theta) * baseR, Math.sin(theta) * baseR);
        pad.rotation.x = Math.PI / 2;
        group.add(pad);
      });

      // --- saddles ------------------------------------------------------------
      const saddleH = Math.max(0.5, R * 1.1);
      for (const frac of [0.22, 0.78]) {
        const x = -L / 2 + frac * L;
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.08, saddleH, Ro * 1.4), supportMat);
        web.position.set(x, -Ro - saddleH / 2 + 0.06, 0);
        group.add(web);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, Ro * 2.1), supportMat);
        base.position.set(x, -Ro - saddleH + 0.02, 0);
        group.add(base);
      }

      group.position.y = (Ro + saddleH) / 2;

      shellRef.current = shellMeshes;
      bundleRef.current = bundleParts;
      frameScene();
    }

    let raf = 0;
    const animate = () => {
      controls.autoRotate = stateRef.current.spin;
      const wf = stateRef.current.wireframe;
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat && "wireframe" in mat) mat.wireframe = wf;
        }
      });
      for (const m of shellRef.current) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat) mat.clippingPlanes = stateRef.current.section ? [clip] : [];
      }
      for (const o of bundleRef.current) o.visible = stateRef.current.tubes;
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
      scene.traverse((o) => {
        const m = o as THREE.Mesh & THREE.LineSegments & THREE.Line;
        if (m.isMesh || m.isLineSegments || m.isLine) {
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        }
      });
      renderer.dispose();
      // release the WebGL context — without this each equipment switch keeps a
      // live context and the browser starts dropping them (the model goes blank)
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      shellRef.current = [];
      bundleRef.current = [];
    };
  }, [sig]);

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
        <button className="btn btn-ghost" onClick={() => setSection((v) => !v)}>
          {section ? "Close shell" : "Section"}
        </button>
        <button className="btn btn-ghost" onClick={() => setTubes((v) => !v)}>
          {tubes ? "Hide tubes" : "Show tubes"}
        </button>
        <span className="viewer3d-tag">
          {design.kind === "fired-heater"
            ? `${name} · ${design.heater?.coilTubes ?? 0} coil tubes · Ø${design.heater?.stackDia ?? 0} mm stack`
            : `${name} · ${design.shellId} mm ID × ${(spec.tubeLength / 1000).toFixed(1)} m · ${design.tubesTotal} tubes`}
        </span>
      </div>
    </div>
  );
}
