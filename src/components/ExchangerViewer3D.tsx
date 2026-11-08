import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { tubeLayout, type ExchangerDesign, type ExchangerSpec } from "../lib/tema";
import { JOINT_LABEL, MECH_LABEL } from "../lib/exchangerClass";
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

export default function ExchangerViewer3D({ tag, spec, design, nozzles }: ExchangerViewerProps) {
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
    design.mech,
    design.orientation,
    design.tubeJoint,
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
    design.heater?.stackHeight ?? 0,
  ].join("|");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef3f8");
    scene.fog = new THREE.Fog("#eef3f8", 60, 220);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 600);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 220;
    controls.autoRotateSpeed = 1.1;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b6c4, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(18, 26, 20);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.85);
    rim.position.set(-20, 12, -16);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    const grid = new THREE.GridHelper(240, 48, 0xc3ced9, 0xdde5ec);
    grid.position.y = 0;
    scene.add(grid);

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
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xc9d6e2,
      metalness: 0.35,
      roughness: 0.35,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
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
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xb96f45,
      metalness: 0.35,
      roughness: 0.72,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      clippingPlanes: [clip],
    });
    const refractoryMat = new THREE.MeshStandardMaterial({
      color: 0x5d3a33,
      metalness: 0.05,
      roughness: 0.95,
      side: THREE.DoubleSide,
      clippingPlanes: [clip],
    });
    const burnerMat = new THREE.MeshStandardMaterial({ color: 0x3d4b57, metalness: 0.7, roughness: 0.45 });
    const liquidMat = new THREE.MeshStandardMaterial({
      color: 0x5aa9c9,
      metalness: 0.1,
      roughness: 0.3,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    const R = (design.shellId / 2) * S;
    const t = Math.max(design.shellThk * S, 0.006);
    const Ro = R + t;
    const L = spec.tubeLength * S;
    const tsT = Math.max(design.tubesheetThk * S, 0.01);
    const rt = (spec.tubeOd / 2) * S;
    const shellMeshes: THREE.Mesh[] = [];
    const bundleParts: THREE.Object3D[] = [];

    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      rot?: [number, number, number],
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rot) m.rotation.set(...rot);
      group.add(m);
      return m;
    };

    /** cylinder along X (shell axis) */
    const cylX = (radius: number, length: number, x: number, mat: THREE.Material, open = true, y = 0, z = 0) =>
      add(new THREE.CylinderGeometry(radius, radius, length, 64, 1, open), mat, x, y, z, [0, 0, Math.PI / 2]);

    /** cylinder along Y (vertical shells, columns, skirts, stacks) */
    const cylY = (radius: number, length: number, y: number, mat: THREE.Material, open = true, x = 0, z = 0) =>
      add(new THREE.CylinderGeometry(radius, radius, length, 64, 1, open), mat, x, y, z);

    const dish = (radius: number, x: number, dir: 1 | -1, mat: THREE.Material, axis: "x" | "y" = "x", y = 0) => {
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
        mat,
      );
      head.scale.set(1, 0.55, 1);
      if (axis === "x") {
        head.rotation.z = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
        head.position.set(x, y, 0);
      } else {
        head.rotation.x = dir === 1 ? 0 : Math.PI;
        head.position.set(0, x, 0);
      }
      group.add(head);
      return head;
    };

    /** nozzle with neck + flange along an arbitrary direction */
    const nozzle = (pos: THREE.Vector3, dir: THREE.Vector3, nr: number, nlen = 0.28) => {
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(nr, nr, nlen, 20, 1, true), nozzleMat);
      neck.position.copy(pos).addScaledVector(dir, nlen / 2);
      neck.quaternion.copy(q);
      group.add(neck);
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(nr * 1.75, nr * 1.75, 0.035, 24), flangeMat);
      fl.position.copy(pos).addScaledVector(dir, nlen);
      fl.quaternion.copy(q);
      group.add(fl);
      const pad = new THREE.Mesh(new THREE.TorusGeometry(nr * 1.35, 0.01, 8, 20), flangeMat);
      pad.position.copy(pos);
      pad.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
      group.add(pad);
    };

    /** circular tube bundle from the TEMA layout — axis X or Y */
    const bundle = (shellId: number, length: number, axis: "x" | "y", x = 0, y = 0, z = 0, radius = rt) => {
      const layout = tubeLayout(shellId, spec);
      const count = Math.min(layout.count, 2400);
      if (!count) return null;
      const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, length, 6), tubeMat, count);
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      if (axis === "x") q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
      const one = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < count; i++) {
        // tubeLayout works in mm, the scene is in metres
        const p = layout.positions[i];
        const py = p.y * S;
        const pz = p.z * S;
        mtx.compose(
          new THREE.Vector3(axis === "x" ? x : x + py, axis === "x" ? y + py : y, axis === "x" ? z + pz : z + pz),
          q,
          one,
        );
        mesh.setMatrixAt(i, mtx);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      bundleParts.push(mesh);
      return mesh;
    };

    /** segmented cross baffles, alternately cut top and bottom (TEMA RCB-4.4) */
    const baffles = (count: number, length: number, radius: number, axis: "x" | "y", y = 0, z = 0) => {
      const n = Math.min(count, 16);
      for (let i = 0; i < n; i++) {
        const f = -length / 2 + ((i + 1) * length) / (n + 1);
        const geo = new THREE.CircleGeometry(radius, 40, i % 2 === 0 ? -Math.PI * 0.08 : Math.PI * 0.58, Math.PI * 0.66);
        const disc =
          axis === "x"
            ? add(geo, baffleMat, f, y, z, [0, Math.PI / 2, 0])
            : add(geo, baffleMat, 0, f, 0, [-Math.PI / 2, 0, 0]);
        bundleParts.push(disc);
      }
    };

    const saddles = (radius: number, length: number, y = 0) => {
      const h = Math.max(0.5, radius * 0.9);
      for (const frac of [0.22, 0.78]) {
        const x = -length / 2 + frac * length;
        add(new THREE.BoxGeometry(0.09, h, radius * 1.5), supportMat, x, y - radius - h / 2 + 0.04, 0);
        add(new THREE.BoxGeometry(0.62, 0.06, radius * 2.2), supportMat, x, y - radius - h + 0.03, 0);
      }
    };

    const legs = (radius: number, length: number, z = 0) => {
      const h = Math.max(0.6, radius * 1.2);
      for (const fx of [-0.28, 0.28]) {
        for (const fz of [-1, 1]) {
          add(
            new THREE.BoxGeometry(0.1, h, 0.1),
            supportMat,
            fx * length,
            -radius - h / 2,
            z + fz * radius * 0.8,
          );
        }
        add(new THREE.BoxGeometry(0.14, 0.06, radius * 1.9), supportMat, fx * length, -radius - h, z);
      }
    };

    /** fit the whole assembly in view, whatever its proportions */
    const frameScene = (pad = 1.02) => {
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const radius = Math.max(size.length() / 2, 0.6);
      // fit both ways round — the card can be much wider than it is tall, or the reverse
      const vFov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const dist = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * pad;
      const dir = new THREE.Vector3(0.78, 0.46, 0.85).normalize();
      controls.target.copy(centre);
      camera.position.copy(centre).addScaledVector(dir, dist);
      controls.minDistance = radius * 0.35;
      controls.maxDistance = dist * 5;
      camera.updateProjectionMatrix();
      controls.update();
    };

    // -----------------------------------------------------------------------
    // horizontal shell & tube: U-tube / floating head / fixed tubesheet
    // -----------------------------------------------------------------------
    const buildHorizontal = () => {
      const mech = design.mech;
      const tubeShellId = design.shellId;
      const shell = cylX(Ro, L, 0, shellMat);
      shellMeshes.push(shell);

      // tubesheets — one for a U-tube bundle, two for fixed / floating heads
      add(new THREE.CylinderGeometry(R, R, tsT, 56), channelMat, L / 2 - tsT / 2, 0, 0, [0, 0, Math.PI / 2]);
      if (design.tubesheetCount > 1) {
        add(new THREE.CylinderGeometry(R, R, tsT, 56), channelMat, -L / 2 + tsT / 2, 0, 0, [0, 0, Math.PI / 2]);
      }

      bundle(tubeShellId, L * 0.985, "x");
      baffles(design.baffleCount, L, (design.bundleDia / 2) * S * 0.94, "x");

      // U-bends at the rear of a U-tube bundle
      if (mech === "u-tube") {
        for (let i = 0; i < 14; i++) {
          const ring = add(
            new THREE.TorusGeometry(rt * 2.2, rt * 0.9, 8, 20, Math.PI),
            tubeMat,
            L / 2 - 0.25,
            0,
            0,
            [0, 0, 0],
          );
          ring.position.y = -R * 0.55 + (i % 7) * R * 0.18;
          ring.position.z = -R * 0.25 + Math.floor(i / 7) * R * 0.35;
          bundleParts.push(ring);
        }
      }

      // front channel with cover and girth flanges
      const chLen = Math.max(0.34, R * 0.95);
      const chX = L / 2 - tsT + chLen / 2;
      cylX(R, chLen, chX, channelMat);
      dish(R, chX + chLen / 2, 1, channelMat);
      add(new THREE.TorusGeometry(R + 0.01, 0.05, 10, 56), flangeMat, L / 2 - tsT, 0, 0, [0, Math.PI / 2, 0]);

      // rear end — fixed head, floating head or U-tube shell cover
      const rearLen = Math.max(0.3, R * 0.8);
      if (mech === "fixed") {
        dish(R, -L / 2 + tsT, -1, channelMat);
        if (spec.features?.some((f) => /bellows/i.test(f))) {
          for (let i = 0; i < 6; i++) {
            add(
              new THREE.TorusGeometry(Ro + 0.02, 0.028, 8, 48),
              channelMat,
              -L / 2 + 0.55 + i * 0.09,
              0,
              0,
              [0, Math.PI / 2, 0],
            );
          }
        }
      } else if (mech === "floating") {
        const rx = -L / 2 + tsT - rearLen / 2;
        cylX(R * 1.06, rearLen, rx, channelMat);
        dish(R * 1.06, rx - rearLen / 2, -1, channelMat);
        add(new THREE.TorusGeometry(R * 1.1, 0.045, 10, 56), flangeMat, -L / 2 + tsT, 0, 0, [0, Math.PI / 2, 0]);
        // floating-head cover inside the shell
        add(new THREE.CylinderGeometry(R * 0.92, R * 0.92, 0.05, 48), baffleMat, -L / 2 + tsT + 0.1, 0, 0, [
          0,
          0,
          Math.PI / 2,
        ]);
      } else {
        cylX(R, rearLen * 0.7, -L / 2 + tsT - rearLen * 0.35, channelMat);
        dish(R, -L / 2 + tsT - rearLen * 0.7, -1, channelMat);
      }

      // nozzles — shell side and channel side
      nozzles.slice(0, 12).forEach((nz, i) => {
        const a = anchorFor(nz.service, i);
        const nr = Math.max((npsOd(nz.nps) / 2) * S, 0.025);
        const inChannel = Math.abs(a.x) > 0.9;
        const theta = (a.angle * Math.PI) / 180;
        const baseR = inChannel ? R + t : Ro;
        const x = inChannel ? (a.x > 0 ? chX : -L / 2 + tsT / 2) : a.x * L;
        const dir = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta));
        nozzle(new THREE.Vector3(x, dir.y * baseR, dir.z * baseR), dir, nr, 0.26 + nr);
      });

      saddles(Ro, L);
      group.position.y = Ro + Math.max(0.5, Ro * 0.9);
      shellRef.current = shellMeshes;
      bundleRef.current = bundleParts;
      frameScene();
    };

    // -----------------------------------------------------------------------
    // vertical floating-head exchanger on a skirt (12-E01)
    // -----------------------------------------------------------------------
    const buildVertical = () => {
      const shell = cylY(Ro, L, 0, shellMat);
      shellMeshes.push(shell);

      // bottom head and skirt
      dish(R, -L / 2, -1, channelMat, "y");
      const skirtH = Math.max(2.6, L * 0.16);
      cylY(Ro * 1.04, skirtH, -L / 2 - skirtH / 2, supportMat);
      add(new THREE.TorusGeometry(Ro * 1.08, 0.075, 10, 64), supportMat, 0, -L / 2 - skirtH, 0, [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(Ro * 1.25, Ro * 1.25, 0.18, 56), supportMat, 0, -L / 2 - skirtH - 0.09, 0);

      // top channel + removable cover
      const chLen = Math.max(0.55, R * 0.9);
      cylY(R, chLen, L / 2 + tsT + chLen / 2, channelMat);
      dish(R, L / 2 + tsT + chLen, 1, channelMat, "y");
      add(new THREE.TorusGeometry(R + 0.01, 0.05, 10, 56), flangeMat, 0, L / 2 + tsT, 0, [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(R, R, tsT, 56), channelMat, 0, L / 2 - tsT / 2, 0);

      // floating head at the bottom, lip seal and internal expansion bellows
      add(new THREE.CylinderGeometry(R, R, tsT, 56), channelMat, 0, -L / 2 + tsT / 2, 0);
      for (let i = 0; i < 8; i++) {
        add(
          new THREE.TorusGeometry(Ro + 0.03, 0.035, 8, 64),
          channelMat,
          0,
          -L / 2 + 1.1 + i * 0.16,
          0,
          [Math.PI / 2, 0, 0],
        );
      }
      add(new THREE.CylinderGeometry(R * 0.97, R * 0.97, 0.12, 48), baffleMat, 0, -L / 2 + 0.5, 0);
      add(new THREE.TorusGeometry(R * 1.02, 0.05, 10, 56), flangeMat, 0, -L / 2 + 0.42, 0, [Math.PI / 2, 0, 0]);

      bundle(design.shellId, L * 0.9, "y", 0, 0, 0);
      baffles(design.baffleCount, L * 0.86, (design.bundleDia / 2) * S * 0.9, "y", 0, 0);

      // shell nozzles
      const shellNozzles = nozzles.filter((n) => /shell/i.test(n.service)).slice(0, 4);
      shellNozzles.forEach((nz, i) => {
        const nr = Math.max((npsOd(nz.nps) / 2) * S, 0.03);
        const y = -L * 0.3 + (i * L) / 4.5;
        nozzle(new THREE.Vector3(0, y, Ro), new THREE.Vector3(0, 0, 1), nr, 0.3 + nr);
      });

      // ladder from grade to the top platform
      const ladZ = -(Ro + 0.35);
      add(new THREE.BoxGeometry(0.06, L * 0.86, 0.06), supportMat, -0.24, -L * 0.05, ladZ);
      add(new THREE.BoxGeometry(0.06, L * 0.86, 0.06), supportMat, 0.24, -L * 0.05, ladZ);
      for (let i = 0; i < 26; i++) {
        add(new THREE.BoxGeometry(0.42, 0.03, 0.03), supportMat, 0, -L * 0.42 + i * (L * 0.8) / 26, ladZ);
      }
      add(new THREE.TorusGeometry(Ro + 0.2, 0.03, 8, 64), supportMat, 0, L / 2 - 0.6, 0, [Math.PI / 2, 0, 0]);

      group.position.y = L / 2 + skirtH;
      shellRef.current = shellMeshes;
      bundleRef.current = bundleParts;
      frameScene(1.04);
    };

    // -----------------------------------------------------------------------
    // kettle reboiler — enlarged K shell, weir, flooded bundle, vapour space
    // -----------------------------------------------------------------------
    const buildKettle = () => {
      const K = cylX(Ro, L, 0, glassMat);
      shellMeshes.push(K);
      // heads
      dish(R, L / 2, 1, channelMat);
      dish(R, -L / 2, -1, channelMat);
      add(new THREE.TorusGeometry(Ro + 0.01, 0.05, 10, 64), flangeMat, L / 2, 0, 0, [0, Math.PI / 2, 0]);
      add(new THREE.TorusGeometry(Ro + 0.01, 0.05, 10, 64), flangeMat, -L / 2, 0, 0, [0, Math.PI / 2, 0]);

      // bundle low in the shell (bundle shell ID is the un-enlarged ID)
      const tubeShell = Math.round(design.shellId / 1.45);
      const bundleY = -R * 0.28;
      bundle(tubeShell, L * 0.72, "x", -L * 0.06, bundleY, 0);
      baffles(design.baffleCount, L * 0.7, (design.bundleDia / 2) * S * 0.9, "x", bundleY, 0);

      // weir near the liquid draw-off end
      add(new THREE.BoxGeometry(0.05, R * 1.05, R * 1.65), baffleMat, L * 0.3, -R * 0.45, 0);
      // liquid level
      add(new THREE.BoxGeometry(L * 0.94, R * 0.72, R * 1.5), liquidMat, 0, -R * 0.62, 0);

      // channel / bonnet on the bundle end
      const chLen = Math.max(0.32, R * 0.6);
      cylX(R * 0.62, chLen, L / 2 + chLen / 2, channelMat);
      dish(R * 0.62, L / 2 + chLen, 1, channelMat);

      // vapour outlet on top, liquid draw-off, feed, drains
      nozzle(new THREE.Vector3(L * 0.28, Ro, 0), new THREE.Vector3(0, 1, 0), Math.max(0.09, R * 0.2), 0.4);
      nozzle(new THREE.Vector3(L * 0.36, -Ro * 0.35, 0), new THREE.Vector3(0, -1, 0), Math.max(0.06, R * 0.12), 0.3);
      nozzle(new THREE.Vector3(-L * 0.32, Ro * 0.2, 0), new THREE.Vector3(0, 1, 0), Math.max(0.07, R * 0.14), 0.3);
      nozzle(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), Math.max(0.06, R * 0.12), 0.25);

      saddles(Ro, L);
      group.position.y = Ro + Math.max(0.5, Ro * 0.9);
      shellRef.current = shellMeshes;
      bundleRef.current = bundleParts;
      frameScene(1.03);
    };

    // -----------------------------------------------------------------------
    // stabbed-in reboiler — bundle inserted through a column shell nozzle
    // -----------------------------------------------------------------------
    const buildStabbedIn = () => {
      const Rc = Math.max(R * 1.3, 1.0);
      const colH = Math.max(L * 1.6, 7);
      const column = cylY(Rc, colH, 0, glassMat);
      shellMeshes.push(column);
      // column flanges and platform rings so the column reads as a vessel
      for (const y of [colH / 2, -colH / 2]) {
        add(new THREE.TorusGeometry(Rc + 0.02, 0.05, 10, 64), flangeMat, 0, y, 0, [Math.PI / 2, 0, 0]);
      }
      for (const y of [-colH * 0.28, colH * 0.28]) {
        add(new THREE.TorusGeometry(Rc + 0.32, 0.035, 8, 56), supportMat, 0, y, 0, [Math.PI / 2, 0, 0]);
      }
      // column ladder
      add(new THREE.BoxGeometry(0.06, colH * 0.8, 0.06), supportMat, Rc + 0.22, 0, -0.2);
      add(new THREE.BoxGeometry(0.06, colH * 0.8, 0.06), supportMat, Rc + 0.22, 0, 0.2);
      for (let i = 0; i < 20; i++) {
        add(new THREE.BoxGeometry(0.03, 0.03, 0.42), supportMat, Rc + 0.22, -colH * 0.4 + (i * colH * 0.8) / 20, 0);
      }

      // large nozzle through the column wall on the +Z side
      const neckLen = 0.85;
      add(
        new THREE.CylinderGeometry(Ro * 1.05, Ro * 1.05, neckLen, 56, 1, true),
        channelMat,
        0, 0, Rc + neckLen / 2 - 0.12,
        [Math.PI / 2, 0, 0],
      );
      add(new THREE.TorusGeometry(Ro * 1.12, 0.07, 10, 64), flangeMat, 0, 0, Rc + neckLen - 0.12);

      // reboiler shell outside the column, with its own dished end
      const shellLen = Math.max(L * 0.5, 3);
      const zShell = Rc + neckLen - 0.1;
      const reboiler = add(
        new THREE.CylinderGeometry(Ro, Ro, shellLen, 64, 1, true),
        shellMat,
        0, 0, zShell + shellLen / 2,
        [Math.PI / 2, 0, 0],
      );
      shellMeshes.push(reboiler);
      const rear = add(
        new THREE.SphereGeometry(Ro, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
        channelMat,
        0, 0, zShell + shellLen,
        [Math.PI / 2, 0, 0],
      );
      rear.scale.set(1, 0.55, 1);
      add(new THREE.TorusGeometry(Ro + 0.01, 0.05, 10, 64), flangeMat, 0, 0, zShell + shellLen);
      nozzle(new THREE.Vector3(0, Ro, zShell + shellLen * 0.55), new THREE.Vector3(0, 1, 0), Math.max(0.08, R * 0.14), 0.3);
      nozzle(new THREE.Vector3(0, -Ro, zShell + shellLen * 0.55), new THREE.Vector3(0, -1, 0), Math.max(0.07, R * 0.12), 0.3);

      // the bundle itself sits inside the column, stabbed through the nozzle
      const b = bundle(Math.round(design.shellId / 1.1), Math.min(L * 0.9, shellLen + Rc * 1.1), "x");
      if (b) {
        b.rotation.set(0, Math.PI / 2, 0);
        b.position.set(0, 0, Rc * 0.05);
      }
      // bundle support inside the column, and the bracket under the reboiler shell
      add(new THREE.BoxGeometry(0.12, R * 1.1, 0.12), supportMat, 0, -R * 0.9, -Rc * 0.4);
      for (const z of [zShell + shellLen * 0.35, zShell + shellLen * 0.85]) {
        add(new THREE.BoxGeometry(0.1, R * 1.4, 0.1), supportMat, 0, -Ro - R * 0.7, z);
      }

      group.position.y = colH / 2 + 0.6;
      shellRef.current = shellMeshes;
      bundleRef.current = bundleParts;
      frameScene(1.05);
    };

    // -----------------------------------------------------------------------
    // hairpin element — two legs joined by a 180° return bend
    // -----------------------------------------------------------------------
    const buildHairpin = () => {
      const gap = Ro + 0.35;
      for (const z of [-gap, gap]) {
        const shell = cylX(Ro, L, 0, shellMat, true, 0, z);
        shellMeshes.push(shell);
        add(new THREE.CylinderGeometry(R, R, tsT, 56), channelMat, L / 2 - tsT / 2, 0, z, [0, 0, Math.PI / 2]);
        const chLen = Math.max(0.3, R * 0.9);
        cylX(R, chLen, L / 2 + chLen / 2, channelMat, true, 0, z);
        dish(R, L / 2 + chLen, 1, channelMat, "x", z);
        add(new THREE.TorusGeometry(R + 0.01, 0.05, 10, 56), flangeMat, L / 2, 0, z, [0, Math.PI / 2, 0]);
        // tubes run the full leg
        bundle(Math.round(design.shellId), L * 0.98, "x", 0, 0, z);
        legs(Ro, L, z);
      }

      // 180° return bend housing at the far end joins the two legs
      add(new THREE.BoxGeometry(0.7, Ro * 2.2, gap * 2 + Ro * 1.4), casingMat, -L / 2 - 0.2, 0, 0);
      const bend = add(
        new THREE.TorusGeometry(gap, Ro * 0.96, 18, 40, Math.PI),
        shellMat,
        -L / 2,
        0,
        0,
        [Math.PI / 2, Math.PI / 2, 0],
      );
      shellMeshes.push(bend);

      group.position.y = Ro + 0.9;
      shellRef.current = shellMeshes;
      bundleRef.current = bundleParts;
      frameScene(1.03);
    };

    // -----------------------------------------------------------------------
    // API 560 fired heater — radiant cabin, coil, burners, convection, stack
    // -----------------------------------------------------------------------
    const buildHeater = () => {
      const heater = design.heater!;
      const pitch = Math.max(spec.pitch, 40) * S;
      const perimeter = Math.max(10, heater.coilTubes * pitch);
      const W = Math.max(4.5, perimeter * 0.3);
      const D = Math.max(3.6, perimeter * 0.2);
      const H = Math.max(4.5, spec.tubeLength * S * 1.45);
      const wallT = 0.1;

      // floor and refractory
      add(new THREE.BoxGeometry(W + 0.5, 0.18, D + 0.5), supportMat, 0, 0.09, 0);
      add(new THREE.BoxGeometry(W, 0.06, D), refractoryMat, 0, 0.2, 0);

      // four casing walls with an inner refractory shell
      const wall = (w: number, h: number, x: number, y: number, z: number, ry = 0) => {
        const m = add(new THREE.BoxGeometry(w, h, wallT), casingMat, x, y, z, [0, ry, 0]);
        shellMeshes.push(m);
        add(new THREE.BoxGeometry(w, h, 0.04), refractoryMat, x, y, z + (ry === 0 ? 0 : 0), [0, ry, 0]).position.z +=
          ry === 0 ? 0 : 0;
        return m;
      };
      wall(W, H, 0, H / 2 + 0.2, D / 2);
      wall(W, H, 0, H / 2 + 0.2, -D / 2);
      wall(D, H, W / 2, H / 2 + 0.2, 0, Math.PI / 2);
      wall(D, H, -W / 2, H / 2 + 0.2, 0, Math.PI / 2);

      // gable roof
      add(new THREE.BoxGeometry(W + 0.6, 0.12, D * 0.62), casingMat, 0, H + 0.35, -D * 0.16, [0.24, 0, 0]);
      add(new THREE.BoxGeometry(W + 0.6, 0.12, D * 0.62), casingMat, 0, H + 0.35, D * 0.16, [-0.24, 0, 0]);

      // vertical coil tubes around the four walls — all coil tubes, instanced
      const openX = W / 2 - 0.28;
      const openZ = D / 2 - 0.28;
      const perSide = Math.max(1, Math.round(heater.coilTubes / 4));
      const inst = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(rt, rt, spec.tubeLength * S, 8),
        tubeMat,
        perSide * 4,
      );
      const mtx = new THREE.Matrix4();
      const one = new THREE.Vector3(1, 1, 1);
      const q = new THREE.Quaternion();
      const yMid = 0.2 + (spec.tubeLength * S) / 2 + 0.25;
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < perSide; i++) {
          const f = perSide === 1 ? 0.5 : i / (perSide - 1);
          let x = 0;
          let z = 0;
          if (side === 0) {
            x = -openX + f * 2 * openX;
            z = openZ;
          } else if (side === 1) {
            x = openX;
            z = openZ - f * 2 * openZ;
          } else if (side === 2) {
            x = openX - f * 2 * openX;
            z = -openZ;
          } else {
            x = -openX;
            z = -openZ + f * 2 * openZ;
          }
          mtx.compose(new THREE.Vector3(x, yMid, z), q, one);
          inst.setMatrixAt(side * perSide + i, mtx);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
      bundleParts.push(inst);

      // return bends at the coil top and tube supports
      for (let i = 0; i < Math.min(perSide, 40); i++) {
        const f = perSide === 1 ? 0.5 : i / (perSide - 1);
        add(new THREE.TorusGeometry(rt * 2.4, rt * 0.95, 8, 18, Math.PI), tubeMat, -openX + f * 2 * openX, yMid + (spec.tubeLength * S) / 2, openZ, [0, 0, 0]);
      }
      for (let i = 0; i < 4; i++) {
        add(new THREE.BoxGeometry(W * 0.9, 0.07, 0.07), supportMat, 0, 0.6 + i * (H - 1) / 3, openZ - 0.05);
      }

      // floor burners, up-fired, two rows
      const burnerCount = Math.min(heater.burners, 8);
      for (let i = 0; i < burnerCount; i++) {
        const f = burnerCount === 1 ? 0.5 : i / (burnerCount - 1);
        const x = -W * 0.32 + f * W * 0.64;
        add(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 16), burnerMat, x, 0.48, D * 0.16);
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12), nozzleMat, x, 0.78, D * 0.16);
        add(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 18), burnerMat, x, 0.24, D * 0.16);
      }

      // convection section on the roof, then the stack
      const convH = Math.max(1.6, H * 0.36);
      const convD = Math.max(2.2, D * 0.62);
      const convW = Math.max(2.8, W * 0.55);
      add(new THREE.BoxGeometry(convW, convH, convD), casingMat, 0, H + convH / 2 + 0.2, -D * 0.22);
      shellMeshes.push(add(new THREE.BoxGeometry(convW * 0.9, convH * 0.9, convD * 0.9), refractoryMat, 0, H + convH / 2 + 0.2, -D * 0.22));
      for (let i = 0; i < 7; i++) {
        add(
          new THREE.CylinderGeometry(rt * 1.05, rt * 1.05, convW * 0.86, 10),
          tubeMat,
          0,
          H + 0.55 + i * (convH * 0.82) / 7,
          -D * 0.22,
          [0, 0, Math.PI / 2],
        );
      }

      const stackR = Math.max(0.35, (heater.stackDia * S) / 2);
      const stackH = Math.min(Math.max(heater.stackHeight * S, 3), H * 1.6);
      const stackX = 0;
      const stackZ = -D * 0.22;
      const baseY = H + convH + 0.2;
      add(new THREE.CylinderGeometry(stackR * 1.5, stackR, 1.1, 32, 1, true), casingMat, stackX, baseY + 0.55, stackZ);
      cylY(stackR, stackH, baseY + 1.1 + stackH / 2, shellMat, true, stackX, stackZ);
      add(new THREE.TorusGeometry(stackR + 0.01, 0.05, 8, 40), flangeMat, stackX, baseY + 1.1, stackZ, [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(stackR * 1.12, stackR * 1.12, 0.14, 32, 1, true), supportMat, stackX, baseY + 1.1 + stackH, stackZ);
      // damper
      add(new THREE.CylinderGeometry(stackR * 0.94, stackR * 0.94, 0.04, 32), baffleMat, stackX, baseY + 1.1 + stackH * 0.35, stackZ);

      // access platform and ladder on the casing
      add(new THREE.BoxGeometry(W * 1.08, 0.08, 0.9), supportMat, 0, H + 0.05, D / 2 + 0.55);
      add(new THREE.BoxGeometry(0.07, H, 0.07), supportMat, W / 2 + 0.45, H / 2, D / 2 + 0.7);
      add(new THREE.BoxGeometry(0.07, H, 0.07), supportMat, W / 2 + 0.45, H / 2, D / 2 + 1.0);
      for (let i = 0; i < 12; i++) {
        add(new THREE.BoxGeometry(0.42, 0.03, 0.03), supportMat, W / 2 + 0.45, 0.3 + (i * H) / 12, D / 2 + 0.85);
      }

      // structural legs down to grade
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          add(new THREE.BoxGeometry(0.16, 1.2, 0.16), supportMat, (sx * W) / 2 * 0.85, 0.6, (sz * D) / 2 * 0.82);
        }
      }

      shellRef.current = shellMeshes;
      bundleRef.current = bundleParts;
      frameScene(1.05);
    };

    // -----------------------------------------------------------------------
    if (design.mech === "fired-heater") buildHeater();
    else if (design.mech === "kettle") buildKettle();
    else if (design.mech === "stabbed-in") buildStabbedIn();
    else if (design.mech === "hairpin") buildHairpin();
    else if (design.orientation === "Vertical") buildVertical();
    else buildHorizontal();

    // grid sits at grade, so lift it to the bottom of whatever was built
    const bounds = new THREE.Box3().setFromObject(group);
    grid.position.y = bounds.min.y - 0.05;

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
        if (mat && mat.opacity === 1) mat.clippingPlanes = stateRef.current.section ? [clip] : [];
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
          {MECH_LABEL[design.mech]} · {design.orientation.toLowerCase()} ·{" "}
          {design.mech === "fired-heater"
            ? `${design.heater?.coilTubes ?? 0} coil tubes · Ø${design.heater?.stackDia ?? 0} mm stack`
            : `${design.tubesheetCount} tubesheet${design.tubesheetCount === 1 ? "" : "s"} · ${design.tubesTotal} tubes · ${JOINT_LABEL[design.tubeJoint]}`}
        </span>
      </div>
    </div>
  );
}
