import * as THREE from "three";
import type { DriveCommand } from "../types";

type DrivingSceneOptions = {
  canvas: HTMLCanvasElement;
  onDriveStart: () => void;
  onLap: (lap: number) => void;
};

type Rect = {
  // x/zはThree.jsの地面上での長方形の中心座標。
  // width/depthはx/z方向の長方形の大きさ。
  x: number;
  z: number;
  width: number;
  depth: number;
};

const roadRects: Rect[] = [
  // コースは3本の太い長方形で構成する。子供が操作しやすいように曲がり角を少なくしている。
  // スタートから右へ進む横道。
  { x: -6, z: 14, width: 42, depth: 8 },
  // 右へ進んだ後、下へ曲がる縦道。
  { x: 14, z: -2, width: 8, depth: 40 },
  // 縦道の終わりからゴールへ進む横道。
  { x: 24, z: -22, width: 28, depth: 8 },
];

const hedgeRects: Rect[] = [
  // 道路の外周を囲む植え込み。描画と当たり判定の両方で使う。
  // スタート横道の上側。
  { x: -4.5, z: 18.8, width: 45, depth: 1.2 },
  // スタート横道の下側。
  { x: -8.5, z: 9.2, width: 37, depth: 1.2 },
  // スタート地点の左端。
  { x: -27.6, z: 14, width: 1.2, depth: 9.6 },
  // 縦道の左側。
  { x: 9.2, z: -8, width: 1.2, depth: 36 },
  // ゴール横道の下側。
  { x: 24, z: -26.8, width: 28, depth: 1.2 },
  // ゴール地点の右端。
  { x: 38.6, z: -22, width: 1.2, depth: 9.6 },
  // ゴール横道の上側。
  { x: 28, z: -17.2, width: 20, depth: 1.2 },
  // 縦道の右側。
  { x: 18.8, z: 0, width: 1.2, depth: 36 },
];

const startPosition = new THREE.Vector3(-24, 0, 14);
const goalRect: Rect = { x: 32, z: -22, width: 6, depth: 6 };

// 植え込みとの当たり判定に足す余白。車幅のおよそ半分。
const carCollisionPadding = 0.62;

function roundedBox(width: number, height: number, depth: number, color: number) {
  // 車体などに使う、少し分割数を増やした箱形メッシュ。
  const geometry = new THREE.BoxGeometry(width, height, depth, 4, 2, 4);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.46,
    metalness: 0.08,
  });
  return new THREE.Mesh(geometry, material);
}

function inRect(point: THREE.Vector3, rect: Rect, padding = 0) {
  // 車の現在位置が、指定した長方形の内側にあるかを判定する。
  // paddingを足すと、車体の幅を考慮した少し大きめの判定にできる。
  return (
    point.x >= rect.x - rect.width / 2 - padding &&
    point.x <= rect.x + rect.width / 2 + padding &&
    point.z >= rect.z - rect.depth / 2 - padding &&
    point.z <= rect.z + rect.depth / 2 + padding
  );
}

function addBox(scene: THREE.Scene, rect: Rect, height: number, y: number, color: number, roughness = 0.75) {
  // Rect定義から地面上の箱を作る共通処理。道路・植え込み・ゴール床で使う。
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(rect.width, height, rect.depth),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.position.set(rect.x, y, rect.z);
  mesh.castShadow = height > 0.2;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export class DrivingScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly car = new THREE.Group();
  private readonly onDriveStart: () => void;
  private readonly onLap: (lap: number) => void;
  private frame = 0;
  private heading = 0;
  private speed = 0;
  private goalCount = 0;
  private hasStartedRun = false;
  private reachedGoal = false;
  private position = startPosition.clone();
  private command: DriveCommand = {
    handShape: "Rock",
    label: "とまる",
    speedTarget: 0,
    turnTarget: 0,
  };

  constructor({ canvas, onDriveStart, onLap }: DrivingSceneOptions) {
    this.onDriveStart = onDriveStart;
    this.onLap = onLap;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color("#91d9ff");
    this.scene.fog = new THREE.Fog("#91d9ff", 62, 126);

    this.buildLights();
    this.buildWorld();
    this.buildCar();
    this.resize();
  }

  setCommand(command: DriveCommand) {
    // React側で決まった手の操作を、次のフレーム更新で使う。
    this.command = command;
  }

  resize() {
    // CSS上のcanvasサイズに合わせて、Three.jsの描画サイズとカメラ比率を更新する。
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.renderer.dispose();
  }

  start() {
    const tick = () => {
      // 毎フレーム、車の位置を更新してから3Dシーンを描画する。
      this.update();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  private buildLights() {
    const hemisphere = new THREE.HemisphereLight("#f5fbff", "#83a56f", 2);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight("#fff2cf", 3.4);
    sun.position.set(-20, 28, 18);
    sun.castShadow = true;
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -46;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);
  }

  private buildWorld() {
    // 地面、道路、植え込み、ゴール、飾りをまとめて配置する。
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(78, 62),
      new THREE.MeshStandardMaterial({ color: "#7fe676", roughness: 0.84 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    roadRects.forEach((rect) => addBox(this.scene, rect, 0.08, 0.02, 0x667078, 0.7));

    this.addRoadMarks();
    this.addMazeHedges();
    this.addGoal();
    this.addTrees();
    // this.addSoftProps();
  }

  private addRoadMarks() {
    // 道路中央の黄色い短線。曲がる方向を見つけやすくするための目印。
    const material = new THREE.MeshStandardMaterial({ color: "#fff6a8", roughness: 0.5 });
    const marks = [
      [-23, 14, 0],
      [-14, 14, 0],
      [-5, 14, 0],
      [6, 14, 0],
      [14, 8, Math.PI / 2],
      [14, 0, Math.PI / 2],
      [14, -8, Math.PI / 2],
      [14, -16, Math.PI / 2],
      [23, -22, 0],
      [32, -22, 0],
    ];

    marks.forEach(([x, z, rotation]) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 0.24), material);
      stripe.position.set(x, 0.1, z);
      stripe.rotation.y = rotation;
      stripe.castShadow = false;
      this.scene.add(stripe);
    });
  }

  private addMazeHedges() {
    // 植え込みは見た目の壁であり、update()内の当たり判定にも使う。
    const hedgeMaterial = new THREE.MeshStandardMaterial({ color: "#278d4f", roughness: 0.82 });

    hedgeRects.forEach((rect) => {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(rect.width, 1.35, rect.depth), hedgeMaterial);
      hedge.position.set(rect.x, 0.68, rect.z);
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      this.scene.add(hedge);
    });
  }

  private addGoal() {
    // ゴールは門とピンク色の床で表現する。床に入るとonLap()を呼ぶ。
    const mat = new THREE.MeshStandardMaterial({ color: "#ffd166", roughness: 0.4 });
    const gateLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.5), mat);
    const gateRight = gateLeft.clone();
    gateLeft.position.set(goalRect.x - 3, 2.2, goalRect.z - 2.7);
    gateRight.position.set(goalRect.x + 3, 2.2, goalRect.z - 2.7);
    const top = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.45, 0.45), mat);
    top.position.set(goalRect.x, 4.4, goalRect.z - 2.7);
    [gateLeft, gateRight, top].forEach((mesh) => {
      mesh.castShadow = true;
      this.scene.add(mesh);
    });

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(goalRect.width, 0.09, goalRect.depth),
      new THREE.MeshStandardMaterial({ color: "#ff8fa3", roughness: 0.42 }),
    );
    pad.position.set(goalRect.x, 0.08, goalRect.z);
    pad.receiveShadow = true;
    this.scene.add(pad);
  }

  private addTrees() {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#94613e", roughness: 0.8 });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: "#2f995b", roughness: 0.75 });

    const positions = [
      [-30, 24],
      [-26, -22],
      [-8, 26],
      [4, 25],
      [22, 22],
      [31, 8],
      [29, -31],
      [-2, -25],
      [-28, 8],
      [35, 22],
    ];

    positions.forEach(([x, z]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.4, 8), trunkMaterial);
      trunk.position.y = 0.72;
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), leafMaterial);
      leaves.scale.set(1.1, 0.95, 1.1);
      leaves.position.y = 1.8;
      leaves.castShadow = true;
      tree.add(trunk, leaves);
      tree.position.set(x, 0, z);
      this.scene.add(tree);
    });
  }

  // private addSoftProps() {
  //   const colors = ["#ff8fa3", "#ffd166", "#7bdff2", "#b2f7a6"];
  //   [
  //     [-4, 5],
  //     [-24, -10],
  //     [1, -20],
  //     [27, 2],
  //     [14, 23],
  //     [-28, 16],
  //   ].forEach(([x, z], index) => {
  //     const balloon = new THREE.Mesh(
  //       new THREE.SphereGeometry(0.36, 20, 14),
  //       new THREE.MeshStandardMaterial({ color: colors[index % colors.length], roughness: 0.38 }),
  //     );
  //     balloon.position.set(x, 1.35, z);
  //     balloon.castShadow = true;
  //     this.scene.add(balloon);
  //   });
  // }

  private buildCar() {
    // 車は複数の簡単な立体を組み合わせたGroupとして作る。
    const body = roundedBox(1.55, 0.58, 2.35, 0xff465d);
    body.position.y = 0.58;
    body.castShadow = true;
    this.car.add(body);

    const cabin = roundedBox(1.08, 0.56, 1.0, 0x9be7ff);
    cabin.position.set(0, 1.02, -0.16);
    cabin.scale.set(1, 0.92, 1);
    cabin.castShadow = true;
    this.car.add(cabin);

    const bumper = roundedBox(1.36, 0.18, 0.22, 0xffd166);
    bumper.position.set(0, 0.5, 1.28);
    bumper.castShadow = true;
    this.car.add(bumper);

    const wheelMaterial = new THREE.MeshStandardMaterial({ color: "#202938", roughness: 0.52 });
    const hubMaterial = new THREE.MeshStandardMaterial({ color: "#f5f7fa", roughness: 0.34, metalness: 0.16 });
    [-0.86, 0.86].forEach((x) => {
      [-0.72, 0.82].forEach((z) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 24), wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.34, z);
        wheel.castShadow = true;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.235, 20), hubMaterial);
        hub.rotation.z = Math.PI / 2;
        wheel.add(hub);
        this.car.add(wheel);
      });
    });

    this.car.position.copy(this.position);
    this.scene.add(this.car);
  }

  private update() {
    const dt = Math.min(this.clock.getDelta(), 0.04);

    // speedTarget/turnTargetは手の形から決まる目標値。急に変わりすぎないよう少しずつ近づける。
    const targetSpeed = this.command.speedTarget * 8.8;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 3.2);
    this.heading += this.command.turnTarget * dt * (0.95 + this.speed * 0.04);

    const previous = this.position.clone();
    this.position.x += Math.cos(this.heading) * this.speed * dt;
    this.position.z += Math.sin(this.heading) * this.speed * dt;

    if (!this.reachedGoal && !this.hasStartedRun && Math.abs(this.speed) > 0.2) {
      this.hasStartedRun = true;
      this.onDriveStart();
    }

    const onRoad = roadRects.some((rect) => inRect(this.position, rect, 0.6));
    const hitHedge = hedgeRects.some((rect) => inRect(this.position, rect, carCollisionPadding));
    if (!onRoad || hitHedge) {
      // 道路外や植え込みに入った場合は、直前位置へ少し戻して減速・反発させる。
      this.position.lerp(previous, 0.7);
      this.speed *= hitHedge ? -0.18 : 0.82;
    }

    if (inRect(this.position, goalRect) && !this.reachedGoal) {
      // ゴール床に入ったらタイマーを止める。短時間後に車だけスタート位置へ戻す。
      this.reachedGoal = true;
      this.goalCount += 1;
      this.onLap(this.goalCount);
      this.speed = 0;
      window.setTimeout(() => {
        this.position.copy(startPosition);
        this.heading = 0;
        this.hasStartedRun = false;
        this.reachedGoal = false;
      }, 900);
    }

    this.car.position.copy(this.position);
    this.car.rotation.y = -this.heading + Math.PI / 2;
    this.car.rotation.z = THREE.MathUtils.clamp(this.command.turnTarget * -0.08, -0.08, 0.08);

    const followDistance = 8.2;
    const followHeight = 5.1;
    const behind = new THREE.Vector3(
      this.position.x - Math.cos(this.heading) * followDistance,
      followHeight,
      this.position.z - Math.sin(this.heading) * followDistance,
    );
    this.camera.position.lerp(behind, 0.09);
    this.camera.lookAt(this.position.x, 0.9, this.position.z);
  }
}
