import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { DriveCommand, ViolationEvent, ViolationType } from "../types";
import { violationRules } from "./trafficRules";

type DrivingSceneOptions = {
    canvas: HTMLCanvasElement;
    onDriveStart: () => void;
    onLap: (lap: number) => void;
    onViolation: (violation: ViolationEvent) => void;
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
// signalZoneで信号の近くを検出し、赤信号中に進んだか判定する。
const signalZone: Rect = { x: -4, z: 14, width: 5, depth: 7 };
// stopApproachZoneで停止線の手前を検出し、止まれたか記録する。
const stopApproachZone: Rect = { x: 6.4, z: 14, width: 4.8, depth: 7 };
// stopPassZoneで停止線の通過を検出し、止まらなかった時に違反にする。
const stopPassZone: Rect = { x: 9.8, z: 14, width: 1.1, depth: 7 };
// nightZoneで夜道エリアを検出し、ライトONなしの走行を違反にする。
const nightZone: Rect = { x: 23, z: -22, width: 9, depth: 7 };

// 植え込みとの当たり判定に足す余白。車幅のおよそ半分。
const carCollisionPadding = 0.62;

function roundedBox(
    width: number,
    height: number,
    depth: number,
    color: number,
) {
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

function addBox(
    scene: THREE.Scene,
    rect: Rect,
    height: number,
    y: number,
    color: number,
    roughness = 0.75,
) {
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
    private readonly onViolation: (violation: ViolationEvent) => void;
    private frame = 0;
    private heading = 0;
    private speed = 0;
    private goalCount = 0;
    private hasStartedRun = false;
    private reachedGoal = false;
    // stopLineSatisfiedで停止線前に一度止まったことを記録し、一時不停止を判定する。
    private stopLineSatisfied = false;
    // redSignalで現在の信号色を保持し、一定時間ごとに赤/青を切り替える。
    private redSignal = true;
    // appliedViolationsで同じ違反を1周につき1回だけ減点する。
    private readonly appliedViolations = new Set<string>();
    // trafficLightBulbsで信号の3色メッシュを保持し、点灯表示を更新する。
    private readonly trafficLightBulbs: THREE.Mesh[] = [];
    // frontLightで自転車ライトを表現し、夜道エリアでライトON操作に反応させる。
    private readonly frontLight = new THREE.PointLight("#fff7bf", 0, 8, 1.6);
    private position = startPosition.clone();
    private command: DriveCommand = {
        action: "idle",
        label: "止まる",
        speedTarget: 0,
        turnTarget: 0,
    };

    constructor({ canvas, onDriveStart, onLap, onViolation }: DrivingSceneOptions) {
        this.onDriveStart = onDriveStart;
        this.onLap = onLap;
        this.onViolation = onViolation;
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene.background = new THREE.Color("#91d9ff");
        this.scene.fog = new THREE.Fog("#91d9ff", 62, 126);

        this.buildLights();
        this.buildWorld();
        this.buildBicycle();
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
        // 半球ライトで空と地面からの明るさを作り、全体を見やすくする。
        const hemisphere = new THREE.HemisphereLight("#f5fbff", "#83a56f", 2);
        this.scene.add(hemisphere);

        // 太陽ライトで影を作り、道路や自転車の立体感を出す。
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
            new THREE.MeshStandardMaterial({
                color: "#7fe676",
                roughness: 0.84,
            }),
        );
        grass.rotation.x = -Math.PI / 2;
        grass.receiveShadow = true;
        this.scene.add(grass);

        roadRects.forEach((rect) =>
            addBox(this.scene, rect, 0.08, 0.02, 0x667078, 0.7),
        );

        this.addRoadMarks();
        this.addRuleMarkers();
        this.addMazeHedges();
        this.addGoal();
        this.addTrees();
        // this.addSoftProps();
    }

    private addRoadMarks() {
        // 道路中央の黄色い短線。曲がる方向を見つけやすくするための目印。
        const material = new THREE.MeshStandardMaterial({
            color: "#fff6a8",
            roughness: 0.5,
        });
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
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(2.1, 0.04, 0.24),
                material,
            );
            stripe.position.set(x, 0.1, z);
            stripe.rotation.y = rotation;
            stripe.castShadow = false;
            this.scene.add(stripe);
        });
    }

    private addMazeHedges() {
        // 植え込みは見た目の壁であり、update()内の当たり判定にも使う。
        const hedgeMaterial = new THREE.MeshStandardMaterial({
            color: "#278d4f",
            roughness: 0.82,
        });

        hedgeRects.forEach((rect) => {
            const hedge = new THREE.Mesh(
                new THREE.BoxGeometry(rect.width, 1.35, rect.depth),
                hedgeMaterial,
            );
            hedge.position.set(rect.x, 0.68, rect.z);
            hedge.castShadow = true;
            hedge.receiveShadow = true;
            this.scene.add(hedge);
        });
    }

    private addRuleMarkers() {
        // 白い停止線で止まる場所を見た目にも分かるようにする。
        const stopLine = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.06, 6.6),
            new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42 }),
        );
        stopLine.position.set(8.2, 0.14, 14);
        stopLine.castShadow = false;
        this.scene.add(stopLine);

        // 赤い三角標識で一時停止ポイントを示す。
        const stopSign = new THREE.Mesh(
            new THREE.ConeGeometry(0.9, 0.12, 3),
            new THREE.MeshStandardMaterial({ color: "#ff2d3f", roughness: 0.38 }),
        );
        stopSign.position.set(8.2, 1.75, 9.7);
        stopSign.rotation.set(Math.PI / 2, 0, Math.PI / 6);
        stopSign.castShadow = true;
        this.scene.add(stopSign);

        // 信号機の柱と本体で赤信号・青信号の判定場所を示す。
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 2.6, 12),
            new THREE.MeshStandardMaterial({ color: "#d8dee7", roughness: 0.46 }),
        );
        pole.position.set(-4, 1.3, 9.7);
        pole.castShadow = true;
        this.scene.add(pole);

        const signalBody = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.55, 0.32),
            new THREE.MeshStandardMaterial({ color: "#344253", roughness: 0.5 }),
        );
        signalBody.position.set(-4, 2.6, 9.55);
        signalBody.castShadow = true;
        this.scene.add(signalBody);

        // 信号の3色を別々のメッシュにして、updateTrafficLightで光り方を変える。
        [0xff4d4d, 0xffd166, 0x4ccf64].forEach((color, index) => {
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.16, 20, 12),
                new THREE.MeshStandardMaterial({
                    color,
                    emissive: color,
                    emissiveIntensity: index === 0 ? 1.4 : 0.08,
                    roughness: 0.32,
                }),
            );
            bulb.position.set(-4.45 + index * 0.45, 2.62, 9.36);
            this.trafficLightBulbs.push(bulb);
            this.scene.add(bulb);
        });

        // 夜道エリアを濃い色の道路で描き、ライトをつける練習場所にする。
        const nightPad = addBox(this.scene, nightZone, 0.1, 0.16, 0x283c5c, 0.72);
        nightPad.material = new THREE.MeshStandardMaterial({
            color: "#283c5c",
            roughness: 0.7,
            emissive: "#0b1530",
            emissiveIntensity: 0.2,
        });
    }

    private addGoal() {
        // ゴールは門とピンク色の床で表現する。床に入るとonLap()を呼ぶ。
        const mat = new THREE.MeshStandardMaterial({
            color: "#ffd166",
            roughness: 0.4,
        });
        const gateLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 4.4, 0.5),
            mat,
        );
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
            new THREE.MeshStandardMaterial({
                color: "#ff8fa3",
                roughness: 0.42,
            }),
        );
        pad.position.set(goalRect.x, 0.08, goalRect.z);
        pad.receiveShadow = true;
        this.scene.add(pad);
    }

    private addTrees() {
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: "#94613e",
            roughness: 0.8,
        });
        const leafMaterial = new THREE.MeshStandardMaterial({
            color: "#2f995b",
            roughness: 0.75,
        });

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
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.18, 0.28, 1.4, 8),
                trunkMaterial,
            );
            trunk.position.y = 0.72;
            trunk.castShadow = true;
            const leaves = new THREE.Mesh(
                new THREE.SphereGeometry(0.95, 16, 12),
                leafMaterial,
            );
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

    private buildBicycle() {
        // 読み込み中や失敗時にも操作できるように、先に簡易自転車を置いてからOBJで差し替える。
        this.addFallbackBicycle();
        this.car.position.copy(this.position);
        this.scene.add(this.car);
        void this.loadBicycleModel();
    }

    private addFallbackBicycle() {
        // OBJ読み込み完了までの間に見える簡易自転車を作る。
        this.car.clear();
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: "#202938",
            roughness: 0.52,
        });

        [-0.78, 0.78].forEach((z) => {
            // TorusGeometryで前輪と後輪を作り、自転車らしいシルエットにする。
            const wheel = new THREE.Mesh(
                new THREE.TorusGeometry(0.42, 0.045, 12, 32),
                wheelMaterial,
            );
            wheel.rotation.y = Math.PI / 2;
            wheel.position.set(0, 0.45, z);
            wheel.castShadow = true;
            this.car.add(wheel);
        });

        const frame = roundedBox(0.12, 0.12, 1.55, 0x35b7c8);
        frame.position.set(0, 0.78, 0);
        frame.castShadow = true;
        this.car.add(frame);

        const handle = roundedBox(0.8, 0.08, 0.08, 0x17324d);
        handle.position.set(0, 1.12, 0.82);
        handle.castShadow = true;
        this.car.add(handle);

        const seat = roundedBox(0.56, 0.08, 0.32, 0x17324d);
        seat.position.set(0, 1.06, -0.25);
        seat.castShadow = true;
        this.car.add(seat);

        this.frontLight.position.set(0, 0.85, 1.2);
        this.car.add(this.frontLight);
    }

    private async loadBicycleModel() {
        try {
            // public配下のOBJ/MTL/テクスチャを読み込み、実際の自転車モデルへ差し替える。
            const modelPath = "/models/bicycle/";
            const materials = await new MTLLoader().setPath(modelPath).loadAsync("11717_bicycle_v2_L1.mtl");
            materials.preload();

            const object = await new OBJLoader()
                .setMaterials(materials)
                .setPath(modelPath)
                .loadAsync("11717_bicycle_v2_L1.obj");

            object.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    // 各メッシュで影を受ける/落とすようにして、道路上に自然に見せる。
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // このOBJはZ軸が高さ方向なので、Three.jsのY軸へ起こしてから正規化する。
            object.rotation.x = -Math.PI / 2;
            object.rotation.z = -Math.PI / 2;
            object.updateMatrixWorld(true);

            const rotatedBox = new THREE.Box3().setFromObject(object);
            const rotatedSize = rotatedBox.getSize(new THREE.Vector3());
            // 一番大きい辺を基準にスケールすることで、モデルサイズをゲーム内の自転車幅へ合わせる。
            const largestSide = Math.max(rotatedSize.x, rotatedSize.y, rotatedSize.z);
            object.scale.setScalar(2.15 / largestSide);
            object.updateMatrixWorld(true);

            // スケール後の中心をcarグループ原点へ戻し、カメラ追従で見失わないようにする。
            const scaledBox = new THREE.Box3().setFromObject(object);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
            object.position.sub(scaledCenter);
            object.updateMatrixWorld(true);

            // 地面より下に出た分を持ち上げ、道路の上に自転車を置く。
            const groundedBox = new THREE.Box3().setFromObject(object);
            object.position.y -= groundedBox.min.y;

            // 簡易自転車を消して、読み込んだOBJモデルへ差し替える。
            this.car.clear();
            this.car.add(object);

            // 自転車ライトはモデル差し替え後も同じcarグループへ付け直す。
            this.frontLight.position.set(0, 0.75, 1.15);
            this.car.add(this.frontLight);
        } catch (error) {
            console.error("Bicycle model failed to load", error);
        }
    }

    private updateTrafficLight() {
        // 経過時間で赤/青を切り替え、信号無視の練習に使う。
        this.redSignal = Math.floor(this.clock.elapsedTime / 4) % 2 === 0;
        this.trafficLightBulbs.forEach((bulb, index) => {
            const material = bulb.material;
            if (!(material instanceof THREE.MeshStandardMaterial)) {
                return;
            }
            const isActive = this.redSignal ? index === 0 : index === 2;
            // 点灯中の色だけemissiveを強くして、見た目で信号状態を伝える。
            material.emissiveIntensity = isActive ? 1.45 : 0.08;
        });
    }

    private reportViolation(type: ViolationType) {
        // 同じ違反で何度も所持金が減らないよう、発生済みなら何もしない。
        if (this.appliedViolations.has(type)) {
            return;
        }

        // 違反データにIDを付けてReact側へ渡し、所持金と青切符カードを更新する。
        this.appliedViolations.add(type);
        this.onViolation({
            ...violationRules[type],
            id: `${type}-${String(this.goalCount)}-${String(Math.round(this.clock.elapsedTime * 1000))}`,
        });
    }

    private updateRuleChecks() {
        // 毎フレーム交通ルール用の判定を行い、必要なら違反イベントを発生させる。
        this.updateTrafficLight();

        // 停止線手前で十分に減速したら、一時停止できた扱いにする。
        if (inRect(this.position, stopApproachZone) && Math.abs(this.speed) < 0.18) {
            this.stopLineSatisfied = true;
        }

        // 停止できていない状態で停止線を通過したら、一時不停止として扱う。
        if (inRect(this.position, stopPassZone) && !this.stopLineSatisfied && Math.abs(this.speed) > 0.3) {
            this.reportViolation("stopSign");
        }

        // 赤信号の範囲で進んでいたら、信号無視として扱う。
        if (inRect(this.position, signalZone) && this.redSignal && Math.abs(this.speed) > 0.3) {
            this.reportViolation("redLight");
        }

        // 夜道エリアでは両手上げのlightOn操作でライトを点灯する。
        const inNight = inRect(this.position, nightZone, 0.2);
        const lightIsOn = inNight && this.command.action === "lightOn";
        this.frontLight.intensity = lightIsOn ? 2.6 : 0;
        // ライトが消えたまま夜道を走ると、無点灯走行として扱う。
        if (inNight && !lightIsOn && Math.abs(this.speed) > 0.3) {
            this.reportViolation("noLight");
        }
    }

    private update() {
        const dt = Math.min(this.clock.getDelta(), 0.04);

        // speedTarget/turnTargetは体の動きから決まる目標値。急に変わりすぎないよう少しずつ近づける。
        const targetSpeed = this.command.speedTarget * 8.8;
        this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 3.2);
        this.heading +=
            this.command.turnTarget * dt * (0.95 + this.speed * 0.04);

        const previous = this.position.clone();
        this.position.x += Math.cos(this.heading) * this.speed * dt;
        this.position.z += Math.sin(this.heading) * this.speed * dt;

        if (
            !this.reachedGoal &&
            !this.hasStartedRun &&
            Math.abs(this.speed) > 0.2
        ) {
            this.hasStartedRun = true;
            this.onDriveStart();
        }

        this.updateRuleChecks();

        const onRoad = roadRects.some((rect) =>
            inRect(this.position, rect, 0.6),
        );
        const hitHedge = hedgeRects.some((rect) =>
            inRect(this.position, rect, carCollisionPadding),
        );
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
                this.stopLineSatisfied = false;
                this.appliedViolations.clear();
            }, 900);
        }

        this.car.position.copy(this.position);
        this.car.rotation.y = -this.heading + Math.PI / 2;
        this.car.rotation.z = THREE.MathUtils.clamp(
            this.command.turnTarget * -0.08,
            -0.08,
            0.08,
        );

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
