import * as THREE from '../three/build/three.module.js';
import {OrbitControls} from '../three/examples/jsm/controls/OrbitControls.js';
import {PointerLockControls} from '../three/examples/jsm/controls/PointerLockControls.js';
import {OBJLoader} from '../three/examples/jsm/loaders/OBJLoader.js';
import {MTLLoader} from '../three/examples/jsm/loaders/MTLLoader.js';

let width = document.documentElement.clientWidth;
let height = document.documentElement.clientHeight;
let container = document.getElementById("container");

container.insertAdjacentHTML("afterbegin",`
    <div id='stage'></div>
`);
const stage = document.getElementById("stage");

document.getElementById("container").insertAdjacentHTML("afterbegin",`
    <div id = 'center'></div>
`);

let focused = false;
let search, searchres;
container.insertAdjacentHTML("afterbegin",`
    <div id="searchdiv">
        <input type="text" id="search" placeholder="検索">
        <div id="searchres"></div>
    </div>
`);
search = document.getElementById("search");
searchres = document.getElementById("searchres");
search.addEventListener("input", ()=>{
    let val = search.value;
    searchres.style.display = "none";
    while(searchres.firstChild){
        searchres.removeChild(searchres.firstChild);
    }
    if(val == "") return;
    for(let i = 0; i < des_len; i++){
        const text = description[i];
        if(text.indexOf(val) != -1){
            searchres.style.display = "block";
            searchres.insertAdjacentHTML("beforeend",`
                <div class="res" id="res${i}">${text}</div>
            `);
            const obj = {
                position: new THREE.Vector3(posi_line[i][0],posi_line[i][1],posi_line[i][2]),
                name: `button_${i}`
            }
            const resdiv = document.getElementById(`res${i}`);
            resdiv.addEventListener("pointerup", ()=>{
                move_groups_trigger(i,true);
                camera_trigger(obj);
                search.blur();
            });
        }
    }
});
search.addEventListener("focus", ()=>{
    focused = true;
    if(searchres.firstChild) searchres.style.display = "block";
});
search.addEventListener("pointerdown", (e)=>{e.stopPropagation();});
search.addEventListener("blur", ()=>{ focused = false; });
searchres.addEventListener("pointerdown", (e)=>{ e.stopPropagation(); });
window.addEventListener("pointerdown", ()=>{
    search.blur();
    searchres.style.display = "none";
});

let mode = "3d"; //3dモデルかstreet viewか
let street_mode = -1; //通常モード:1/音展モード:-1
let locked = false; //pointerlockが有効かどうか
const user_ios =  /[ \(]iP/.test(navigator.userAgent);
const user_phone = navigator.userAgent.match(/iPhone|Android.+Mobile/);
// const user_phone = true;

/* ↓------------------------------ 3dモデル用のscene作成-------------------------------------------*/
const scene = new THREE.Scene();
scene.background = new THREE.Color('skyblue');
scene.name = undefined;
//カメラ
const camera = new THREE.PerspectiveCamera(75, width/height, 0.01, 1000);
let camera_target = new THREE.Vector3(0,100,80);
camera.position.set(0, 100, 80.01);
scene.add(camera);

//地面
{
    const planeSize = 1024;

    //画像
    const texture = new THREE.TextureLoader().load('../images/grass.png');
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearMipmapLinearFilter;
    //planeSize/2回リピート
    const repeats = planeSize / 64;
    texture.repeat.set(repeats, repeats);

    //平面のジオメトリ
    const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);
    //マテリアル
    const planeMat = new THREE.MeshPhongMaterial({
        map: texture,
        side: THREE.DoubleSide //両面描画
    });
    //合成してメッシュ
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    mesh.rotation.x = Math.PI * -.5;
    mesh.position.y -= 2;
    //sceneに追加
    scene.add(mesh);
}

//半球光源 追加
{
    const skyColor = 0xB1E1FF;  // light blue
    const groundColor = 0xcd853f;  // brownish orange
    const intensity = 0.7;
    const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    scene.add(light);
}

//平行光源 追加
{
    const color = 0xFFFFFF;
    const intensity = 0.4;
    const light1 = new THREE.DirectionalLight(color, intensity);
    light1.position.set(5, 10, 2);
    scene.add(light1);
    const light2 = new THREE.DirectionalLight(color, intensity);
    light2.position.set(-5, 10, -2);
    scene.add(light2);
}

//外側の球
{
    const geometry = new THREE.SphereGeometry(400, 64, 64);
    geometry.scale(-1, 1, 1);
    const material =  new THREE.MeshLambertMaterial({color: 0x87ceeb});
    const sphere = new THREE.Mesh( geometry, material);
    scene.add( sphere );
}
/*↑____________________________ここまで3d用scene__________________________________________________*/

/*↓----------------------------ストリートビュー用のscene作成------------------------------------------*/
const street_scene = new THREE.Scene();
street_scene.background = new THREE.Color('black');
street_scene.name = undefined;

//カメラ
const street_camera = new THREE.PerspectiveCamera(75, width / height, 0.01,50);
street_camera.position.set(0.01, 0, 0);
street_scene.add(street_camera);

//画像を貼る球の作成
let sphere;
{
    const geometry = new THREE.SphereGeometry(8, 64, 64);
    geometry.scale(-1, 1, 1);
    const material =  new THREE.MeshLambertMaterial();
    sphere = new THREE.Mesh( geometry, material);
    sphere.name = undefined;
    street_scene.add( sphere );
}

//環境光源追加
{
    const light = new THREE.AmbientLight(0xFFFFFF, 1.0);
    street_scene.add(light);
}
/*↑______________________________ここまでストリートビュー用のscene______________________________________*/

//レンダラー作成
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(width, height);
renderer.setClearColor({color: 0x000000});
// renderer.shadowMap.enabled = true;
const element = renderer.domElement;

function create_controls(cam,elem){
    const controls = new OrbitControls(cam, elem);
    controls.target.set(0, 0, 0);
    controls.maxDistance = 0.01;
    controls.minDistance = 0.01;
    //各種設定
    controls.enableDamping = true;
    controls.enableZoom = true; //falseは二本指で暴走
    controls.enablePan = false;
    controls.enableRotate = true;

    // 視点の速さ (timeCheck関数内も変更)
    controls.dampingFactor = 0.2;
    controls.rotateSpeed = 0.6;

    return controls;
}
const controls_orbit = create_controls(camera,element); //control 作成
    controls_orbit.maxPolarAngle = Math.PI - 0.01; //真下・真上防止
    controls_orbit.minPolarAngle = 0.01;

const controls_pointer = new PointerLockControls(camera, element);

let controls = controls_orbit;

const street_controls_orbit = create_controls(street_camera,element);
    street_controls_orbit.enabled = false;

const street_controls_pointer =  new PointerLockControls(street_camera, element);

let street_controls = street_controls_orbit;

stage.appendChild(element);

document.getElementById("container").insertAdjacentHTML("afterbegin","<canvas id='stick'></canvas>");
const stick = document.getElementById("stick");
const stick_canvas = stick.getContext("2d");
if(!user_phone) stick.style.display = "none"; // PCなら削除
let oriv = new THREE.Vector2(0,0);
let hrate, high;
handleResize();

let stick_flag = false;
let curv = new THREE.Vector2(0,0);
stick.addEventListener("pointerdown", (e)=>{
    controls_orbit.enabled = false;
    const x = e.clientX - stage.offsetLeft;
    const y = e.clientY - stage.offsetTop;
    stick_flag = true;
    curv.set(y, x);
});

stick.addEventListener("pointermove", (e)=>{
    const x = e.clientX - stage.offsetLeft;
    const y = e.clientY - stage.offsetTop;
    curv.set(y, x);
});

stick.addEventListener("pointerleave", ()=>{
    stick_flag = false;
    controls_orbit.enabled = true;
});

stick.addEventListener("pointerup", ()=>{
    stick_flag = false;
    controls_orbit.enabled = true;
});

//クリック
element.addEventListener("pointerdown", (e) => {
    let x,y;
    if(!locked){
        x = e.clientX - stage.offsetLeft;
        y = e.clientY - stage.offsetTop;
    } else {
        x = stage.offsetWidth / 2;
        y = stage.offsetHeight / 2;
    }
    pre_click(x,y);
}, false);

element.addEventListener("pointerup", (e) => {
    let x,y;
    if(!locked){
        x = e.clientX - stage.offsetLeft;
        y = e.clientY - stage.offsetTop;
    } else {
        x = stage.offsetWidth / 2;
        y = stage.offsetHeight / 2;
    }
    click(x,y);
}, false);

console.log("push M key to lock pointer");
function lock_pointer(){
    if(turn_flag) return;
    locked = true;
    controls = controls_pointer;
    street_controls = street_controls_pointer;
    controls_orbit.enabled = false;
    street_controls_orbit.enabled = false;
    controls.lock();
    if(mode == "3d") camera_target = camera.position;
    document.getElementById("center").style.display = "block";
};

function release_pointer(){
    if(turn_flag) return;
    locked = false;
    controls.unlock();
    if(mode == "3d") camera_target = camera.position.clone().add(controls.getDirection(new THREE.Vector3()).multiplyScalar(0.01));
    else street_camera.position.copy(street_controls.getDirection(new THREE.Vector3()).multiplyScalar(-0.01));
    controls = controls_orbit;
    street_controls = street_controls_orbit;
    controls_orbit.enabled = true;
    street_controls_orbit.enabled = true;
    document.getElementById("center").style.display = "none";
}
document.addEventListener("pointerlockchange", ()=>{
    if(document.pointerLockElement != element && locked) release_pointer();
});

let key_flag = [false,false,false,false,false,false];
window.addEventListener("keydown",(e)=>{
    if(focused) return;
    const key = e.key;
    if(key == "m" || key == "M"){
        if(locked) release_pointer();
        else lock_pointer();
    }
    if(mode == "3d"){
        if(key == "w" || key == "W" || key == "ArrowUp"){
            key_flag[0] = true;
        } else if(key == "s" || key == "S" || key == "ArrowDown"){
            key_flag[1] = true;
        } else if(key == "d" || key == "D" || key == "ArrowRight"){
            key_flag[2] = true;
        } else if(key == "a" || key == "A" || key == "ArrowLeft"){
            key_flag[3] = true;
        } else if(key == " "){
            key_flag[4] = true;
        } else if(key == "Shift"){
            key_flag[5] = true;
        }
    } else {
        if(key == "d" || key == "D"){
            del();
        }
    }
});

window.addEventListener("keyup",(e)=>{
    const key = e.key;
    if(key == "w" || key == "W" || key == "ArrowUp"){
        key_flag[0] = false;
    } else if(key == "s" || key == "S" || key == "ArrowDown"){
        key_flag[1] = false;
    } else if(key == "d" || key == "D" || key == "ArrowRight"){
        key_flag[2] = false;
    } else if(key == "a" || key == "A" || key == "ArrowLeft"){
        key_flag[3] = false;
    } else if(key == " "){
        key_flag[4] = false;
    } else if(key == "Shift"){
        key_flag[5] = false;
    } else if(key == "Escape"){
        key_flag = [false,false,false,false,false,false];
    }
});

window.addEventListener("blur",()=>{
    key_flag = [false,false,false,false,false,false];
});

window.addEventListener("resize", handleResize, false);

//ボタンのテクスチャ
const button_tex = new THREE.TextureLoader().load('../images/button.png');
let buttons = [];

let posi_line = [];  //[x,y,z, 枚数, 校舎,階番号]
let posi = [         //[x,y,z, 枚数,点番号]
    [ [],[],[],[],[] ], //南校舎
    [ [],[],[],[],[] ], //北校舎
    [ [],[]       ], //東の橋
    [ [],[]       ], //西の橋
    [ [],[],[]    ], //食堂
    [ [],[]       ], //体育館
    [ [],[]       ], //講堂
    [ []          ]  //地面
];
let posi_line_len, des_len;
let connection = [];
let map = [];
let images = [];
let description = [];

fetch("./locations.json")
    .then(res => res.json())
    .then(data => {
        posi_line = data.position;
        connection = data.connection;
        description = data.description;
        posi_line_len = posi_line.length;
        des_len = description.length;

        //posiに整理
        for(let i=0; i<posi_line_len; ++i){
            if(posi_line[i][4] == -1) continue;
            posi[ posi_line[i][4] ][ posi_line[i][5] ].push([ posi_line[i][0], posi_line[i][1], posi_line[i][2], posi_line[i][3], i]);
        }

        //connectionの整理
        for (let i = 0; i < posi_line_len; ++i) map.push([]);
        connection.forEach((val) => {
            map[val[0]].push(val[1]);
            map[val[1]].push(val[0]);
        });

        for(let i = 0; i < posi_line_len; ++i) images[i] = [undefined,undefined];
    });

async function load_picture (i,j){
    let provec = [];
    function threeload(url,number,mode){
        return new Promise((resolve)=>{
            if(images[number][mode] == undefined){
                const loader = new THREE.TextureLoader().load(url,(tex)=>{
                    images[number][mode] = tex;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    async function wait(){
        await Promise.all(provec);
        provec = [];
    }
    provec.push(threeload(`../images/image${i}-${j}.JPG`,i,j));
    await wait();
}

//上のバーなど削除(global)

window.del = () => {
    arrows.forEach((val) => {street_scene.remove(val);});
    arrows = [];
    // document.getElementById("minimap").remove();
    document.getElementById("delb").remove();
    document.getElementById("menub").remove();
    document.getElementById("menubar").remove();
    document.getElementById("spotviewer").remove();
    document.querySelector(".modep").remove();
    mode = "3d";
    camera_target.copy(new THREE.Vector3(posi_line[cur][0],posi_line[cur][1],posi_line[cur][2]));
    if(!locked){
        street_controls_orbit.enabled = false;
        controls_orbit.enabled = true;
        const theta = posi_to_theta(street_camera.position.z,street_camera.position.x);
        camera.position.copy(
            camera_target.clone()
            .sub(new THREE.Vector3(0.01*Math.cos(theta),0,-0.01*Math.sin(theta)))
        );
    } else {
        camera.position.copy(new THREE.Vector3(posi_line[cur][0],posi_line[cur][1],posi_line[cur][2]));
        const _vector = new THREE.Vector3();
        _vector.setFromMatrixColumn( street_camera.matrix, 0 );
        const forward = _vector.crossVectors( street_camera.up, _vector );
        camera.lookAt(
            camera.position.clone().add(new THREE.Vector3(-forward.z,0,forward.x))
        );
    }
    move_groups_trigger(cur,true);
    stick.style.display = "block";
    search.style.display = "block";
};

window.move_groups_trigger = (cur,needs_calc)=>{
    if(needs_calc){
        let num = posi_line[cur][5];
        for(let i = 1; i <= posi_line[cur][4]; i++){
            num += posi[i-1].length;
        }
        cur = num;
    }
    if(state != cur){ //異なる階選択時
        //校舎の上下
        if(state != "closed" && groups[state].part_of == groups[cur].part_of && state < cur){
            //同じ校舎かつ現在より上
            add_later = true;
        } else {
            //現在より下か他校舎
            delete_buttons();
            generate_buttons(cur);
            add_later = false;
        }
        state = cur;
        move_groups_flag = true;
    }
}

let spot = -1;
// スポットセレクト(global)
window.spotSerect = ()=>{
    if(width >= height) high = 30;
    else high = 20;
    if(spot == -1){
        document.getElementById("spotviewer").style.top = "0";
        document.getElementById("menubar").style.top = `calc(${high}% + 4px)`;
        document.getElementById("menub").style.transform ="rotate(-135deg)"
    } else {
        document.getElementById("spotviewer").style.top = `-${high}%`;
        document.getElementById("menubar").style.top = "4px";
        document.getElementById("menub").style.transform ="rotate(0deg)"
    }
    spot *= -1;
};

//better_view ここから--------------------------------------------------------------------------------------------------
let view_cnt = 0, b, bv;
window.better_view = ()=>{

    let check = false;
    function hide_show(){
        if(width >= height) high = 30;
        else high = 20;
        if(view_cnt == 1){
            // minimap.style.display = "none";
            // minibutton.style.display = "none";
            arrows.forEach((val) => {street_scene.remove(val);});
            document.getElementById("menubar").style.top = "calc(-13vmin - 6px)";
            document.getElementById("spotviewer").style.top = `-${high}%`;
            document.getElementById("container").insertAdjacentHTML("afterbegin","<div id='showb' onclick='better_view()'><div id='showbv'></div></div>");
            b = document.getElementById("showb");
            bv = document.getElementById("showbv");
            setTimeout(hide_bar,20);

            element.addEventListener("pointerdown", show_bar, {passive: true});
            element.addEventListener("pointerup", hide_bar, {passive: true});
            document.getElementById("showb").addEventListener("pointerleave", hide_bar, {passive: true});
            document.getElementById("showb").addEventListener("pointerenter", show_bar, {passive: true});
            document.getElementById("container").addEventListener("pointerleave", hide_bar, {passive: true});

            view_cnt *= -1;
        } else {
            // minimap.style.display = "block";
            // minibutton.style.display = "block";
            arrows.forEach((val) => {street_scene.add(val);});
            document.getElementById("menubar").style.top = "4px";
            document.getElementById("showb").remove();

            element.removeEventListener("pointerdown", show_bar, {passive: true});
            element.removeEventListener("pointerup", hide_bar, {passive: true});
            document.getElementById("container").removeEventListener("pointerleave", hide_bar, {passive: true});
            if(document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement){
                if      (document.fullscreenEnabled)        document.exitFullscreen();
                else if (document.webkitFullscreenEnabled)  document.webkitCancelFullScreen();
                else if (document.mozFullScreenEnabled)     document.mozCancelFullScreen();
                else if (document.msFullscreenEnabled)      document.msExitFullscreen();
            }

            view_cnt++;
        }
    }

    if(view_cnt != 0) hide_show();
    else {
        view_cnt++;
        if(!user_ios){
            if     (document.fullscreenEnabled)         document.body.requestFullscreen();
            else if(document.webkitFullscreenEnabled)   document.body.webkitRequestFullscreen();
            else if(document.mozFullScreenEnabled)      document.body.mozRequestFullScreen();
            else if(document.msFullscreenEnabled)       document.body.msRequestFullscreen();
            else                                        hide_show();
        } else hide_show();
    }
};

function show_bar(){
    b.style.transition = "all 0.1s cubic-bezier(0.55, 0.06, 0.68, 0.19)";
    bv.style.transition = "all 0.1s cubic-bezier(0.55, 0.06, 0.68, 0.19)";
    b.style.backgroundColor = "rgba(255, 255, 255, .6)";
    if(width >= height){
        bv.style.borderBottom = ".8vmin solid rgb(255, 255, 255, 0.9)";
        bv.style.borderRight = ".8vmin solid rgb(255, 255, 255, 0.9)";
    } else {
        bv.style.borderBottom = "1.3vw solid rgb(255, 255, 255, 0.9)";
        bv.style.borderRight = "1.3vw solid rgb(255, 255, 255, 0.9)";
    }
}

function hide_bar(){
    b.style.transition = "all 3s cubic-bezier(0.55, 0.06, 0.68, 0.19)";
    bv.style.transition = "all 3s cubic-bezier(0.55, 0.06, 0.68, 0.19)";
    b.style.backgroundColor = "rgba(255, 255, 255, .0)";
    if(width >= height){
        bv.style.borderBottom = ".8vmin solid rgb(255, 255, 255, .0)";
        bv.style.borderRight = ".8vmin solid rgb(255, 255, 255, .0)";
    } else {
        bv.style.borderBottom = "1.3vw solid rgb(255, 255, 255, .0)";
        bv.style.borderRight = "1.3vw solid rgb(255, 255, 255, .0)";
    }
}
//ここまでbetter_view ---------------------------------------------------------------------------------------------------

let rotate_flag = false, modep_cnt = [0,0];
window.change_mode = (async () =>{
    street_mode *= -1;

    const rotate_img = document.getElementById("mode");
    const el = document.querySelector('.modep');
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    //テキスト
    if(street_mode === 1) el.innerHTML = "通常モード";
    else el.innerHTML = "音展モード"
    // cur = 1; //テスト用

    if(street_mode == 1 || posi_line[cur][3] == 1){
        await load_picture(cur,0);
        sphere.material.map = images[cur][0];
    } else {
        await load_picture(cur,1);
        sphere.material.map = images[cur][1];
    }
    sphere.material.needsUpdate = true;

    //画像を回す
    (async ()=>{
        if(!rotate_flag){
            rotate_flag = true;
            rotate_img.style.transition = "all .5s";
            rotate_img.style.transform = `rotate(-180deg)`;

            await wait(500);

            rotate_img.style.transition = "all .0s"
            rotate_img.style.transform = `rotate(0deg)`;
            rotate_flag = false;
        } else  return;
    })();

    //黒四角の表示
    if(modep_cnt[0] == 0) el.style.display = "";
    modep_cnt[0]++; modep_cnt[1]++;

        await wait(100); //クリックから表示まで

    el.classList.add('show');

        await wait(1500); //表示中

    if(modep_cnt[1] == 1) el.classList.remove('show');
    modep_cnt[1]--;

        await wait(1000); //消えかけ

    if(modep_cnt[0] == 1) el.style.display = "none";
    modep_cnt[0]--;
});

//矢印読み込み
const arrow_image = new THREE.TextureLoader().load('../images/arrow.png');
let arrows = [], originposi = [];
//矢印生成
function generate_arrows(src) {
    const geo = new THREE.BoxGeometry(0.5, 0, 0.5);
    const mate = new THREE.MeshBasicMaterial({ map: arrow_image, transparent: true });

    arrows = []; originposi = [];
    for (let i = 0; i < map[src].length; ++i) {
        let arrow = new THREE.Mesh(geo, mate);

        arrow.name = map[src][i];
        arrows.push(arrow);

        let xmove = posi_line[map[src][i]][0] - posi_line[src][0],
            zmove = posi_line[map[src][i]][2] - posi_line[src][2];

        arrow.rotation.y = posi_to_theta(zmove,xmove)-Math.PI*0.5;
        [xmove, zmove] = [zmove, -xmove]; //swap
        //半径
        let r = 0.75;
        originposi.push([xmove * Math.sqrt(r*r / (xmove * xmove + zmove * zmove)), zmove * Math.sqrt(r*r / (xmove * xmove + zmove * zmove))]);
        arrow.position.y = -1.3-i*0.001;
        street_scene.add(arrow);
    }
}

//逆三角関数

function posi_to_theta(x,y){
    let rotate;
    // x *= -1; z *= -1;
    if (x == 0) {
        if (y >= 0) rotate = Math.PI * 0.5;
        else rotate = Math.PI * 1.5;
    } else {
        rotate = Math.atan(y/x);
        if (x < 0) rotate += Math.PI;
        else if(rotate < 0) rotate += Math.PI * 2;
    }
    return rotate;
}

//obj追加
let groups = []; //こっちでgroup作ってあとでぶっこむ

const dist = 14;
const max_alt = 100;
let state = "closed";

//オブジェクト読み込み
function load_obj(mtl_file_name, obj_file_name){
    if(mtl_file_name == undefined){ //マテリアルないとき
        return new Promise((resolve,reject) => {
            const objLoader = new OBJLoader();
            objLoader.load("./models/koyo/" + obj_file_name, (root) => {
                resolve(root);
            });
        });
    } else { //マテリアルあるとき
        return new Promise((resolve,reject) => {
            const mtlLoader = new MTLLoader();
            mtlLoader.load("./models/koyo/" + mtl_file_name, (mtl) => {
                mtl.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(mtl);
                objLoader.load("./models/koyo/" + obj_file_name, (root) => {
                    resolve(root);
                });
            });
        });
    }
}

let loaded = false;
const urls = [
    [undefined,"3dMap_south_1F.obj"], //0
    [undefined,"3dMap_south_2F.obj"],
    [undefined,"3dMap_south_3F.obj"],
    [undefined,"3dMap_south_4F.obj"],
    [undefined,"3dMap_south_ceiling.obj"],
    [undefined,"3dMap_north_1F.obj"], //5
    [undefined,"3dMap_north_2F.obj"],
    [undefined,"3dMap_north_3F.obj"],
    [undefined,"3dMap_north_4F.obj"],
    [undefined,"3dMap_north_ceiling.obj"],
    [undefined,"3dMap_east_bridge.obj"], //10
    [undefined,"3dMap_east_ceiling.obj"],
    [undefined,"3dMap_west_bridge.obj"],
    [undefined,"3dMap_west_ceiling.obj"],
    [undefined,"3dMap_cafe_1F.obj"],
    [undefined,"3dMap_cafe_2F.obj"], //15
    [undefined,"3dMap_cafe_ceiling.obj"],
    [undefined,"3dMap_gym.obj"],
    [undefined,"3dMap_gym_ceiling.obj"],
    [undefined,"3dMap_audi.obj"],
    [undefined,"3dMap_audi_ceiling.obj"], //20
    [undefined,"3dMap_ground.obj"],
];
const groups_len = urls.length;

(async () => {
    for(let i = 0; i < groups_len; i++){
        await load_obj(urls[i][0],urls[i][1]).then((root) => {
            groups[i] = root;
            groups[i].name = i; //番号
            groups[i].scale.set(3,3,3);
            if(0 <= i && i <= 4){
                groups[i].part_of = "south"; //建物識別用の名前
            } else if(5 <= i && i <= 9){
                groups[i].part_of = "north";
            } else if(10 <= i && i <= 11){
                groups[i].part_of = "east_bridge";
            } else if(12 <= i && i <= 13){
                groups[i].part_of = "west_bridge";
            } else if(14 <= i && i <= 16){
                groups[i].part_of = "cafe";
            } else if(17 <= i && i <= 18){
                groups[i].part_of = "gym";
            } else if(19 <= i && i <= 20){
                groups[i].part_of = "audi";
            } else if(i == 21){
                groups[i].part_of = "ground";
            }

            groups[i].ori_position = groups[i].position.clone();
            scene.add(groups[i]);
        });
    }
    loaded = true;
})();

//青ボタン生成
function generate_buttons(number){ //3dモデル操作中のみ実行
    let array;
    if(0 <= number && number <= 3){
        array = posi[0][number];
    } else if(5 <= number && number <= 8){
        array = posi[1][number-5];
    } else if(number == 10){
        array = posi[2][number-10];
    } else if(number == 12){
        array = posi[3][number-12];
    } else if(14 <= number && number <= 15){
        array = posi[4][number-14];
    } else if(number == 17){
        array = posi[4][number-17];
    } else if(number == 19){
        array = posi[4][number-19];
    } else return;

    for(let vec of array){
        const geometry = new THREE.SphereGeometry(3, 16, 16);
        const material =  new THREE.MeshLambertMaterial({color: 0x00bfff, transparent: true, opacity: 0.5});
        const mesh = new THREE.Mesh( geometry, material);
        //sceneに追加
        mesh.position.copy(new THREE.Vector3(vec[0],vec[1],vec[2]));
        // mesh.name = `button_${vec[3]}`;
        mesh.name = `Button_${vec[4]}`;
        buttons.push(mesh);
        scene.add(mesh);
    }
}

//青ボタン削除
function delete_buttons(){ //3dモデル操作中のみ実行
    const len = buttons.length;
    for(let i = 0; i < len; i++){
        scene.remove(buttons[i]);
        buttons[i].geometry.dispose();
        buttons[i].material.dispose();
        buttons[i] = undefined;
    }
    buttons = [];
}

let pre_elem_name;
let pre_posi = {x:undefined, y:undefined} ; //obj
function pre_click(x,y){
    pre_posi.x = x; pre_posi.y =  y;

    const mouse = new THREE.Vector2();
    mouse.x = (x / width) * 2 - 1;
    mouse.y = -(y / height) * 2 + 1;

    const ray = new THREE.Raycaster;
    let bump;
    if(mode == "street"){
        ray.setFromCamera(mouse, street_camera);
        bump = ray.intersectObjects(street_scene.children,false);
        if(bump.length > 0) pre_elem_name = bump[0].object.name;
    } else {
        ray.setFromCamera(mouse, camera);
        bump = ray.intersectObjects(scene.children,true); //<=第二引数trueで下位のobjectも
        if(bump.length > 0) pre_elem_name = bump[0].object.parent.name;
    }
}

//クリック時の処理
function click(x,y) {
    //objロード前return
    if(!loaded) return;
    //ドラッグとの区別
    if(Math.abs(pre_posi.x-x) > 3 || Math.abs(pre_posi.y-y) > 3) return;

    const mouse = new THREE.Vector2();
    mouse.x = (x / width) * 2 - 1;
    mouse.y = -(y / height) * 2 + 1;

    const ray = new THREE.Raycaster;
    //ここからmodeで分岐作って！！！ <====================
    if(mode == "street"){
        ray.setFromCamera(mouse, street_camera);
        const bump = ray.intersectObjects(street_scene.children,true);
        if(bump.length != 0 && bump[0].object.name != undefined){
            street_move(bump[0].object.name);
        }
    } else {
        ray.setFromCamera(mouse, camera);
        const bump = ray.intersectObjects(scene.children,true);
        if (bump.length != 0 && bump[0].object.parent.name == pre_elem_name && !turn_flag) {
            const obj = bump[0].object.parent;

            //青ボタンクリック
            if(bump[0].object.name.split("_")[0] == "Button"){

                camera_trigger(bump[0].object);

            //校舎クリック obj.name: 0,1,2,...
            } else if(obj.name != undefined){
                //スマホ救済用 青ボタン判定ゆるく
                const point = bump[0].point;
                let nearest = {dist: 1e9, button: undefined};
                //最も近いボタン求める
                let len = buttons.length;
                for(let i = 0; i < len; i++){
                    let button = buttons[i];
                    const new_dist = button.position.clone().sub(point).length();
                    if(nearest.dist > new_dist){
                        nearest.dist = new_dist;
                        nearest.button = button;
                    }
                }
                if(nearest.dist < 5){
                    //カメラ移動
                    camera_trigger(nearest.button);
                } else move_groups_trigger(obj.name, false);
            //その他クリック -> closed
            } else {
                delete_buttons();
                state = "closed";
                move_groups_flag = true;
            }
        }
    }
}

let turn_flag = false;
let turn_info; //obj

//move_camera関数のトリガー(計算)(global)
window.camera_trigger = (button)=>{ //3dモデル操作中のみ実行
    const oav = button.position;
    const ocv = camera.position.clone();
    const acv = ocv.clone().sub(oav);
    const ohv = new THREE.Vector3(ocv.x, oav.y, ocv.z);
    const ahv = ohv.clone().sub(oav);
    let theta = ahv.clone().angleTo(acv); //thetaはラジアン
    if(oav.y > ocv.y) theta *= -1;
    const to = Number(button.name.split("_")[1]);

    //aを通るy一定の平面とfrontベクトルの交点(oiv)
    const h = oav.clone().dot(new THREE.Vector3(0,1,0));
    const n = new THREE.Vector3(0,1,0);
    const m = locked ? camera.getWorldDirection(new THREE.Vector3()) : camera_target.clone().sub(camera.position);
    let oiv;

    if(n.clone().dot(m) == 0) m.sub(new THREE.Vector3(0,0.001,0)); //並行対策
    if(n.clone().dot(m) * n.clone().dot(acv.clone().negate()) < 0) oiv = camera_target.clone(); //特殊な場合
    else{
        oiv = camera.position.clone()
            .add(m.clone().multiplyScalar( (h - n.clone().dot(camera.position)) / n.clone().dot(m) ));
    }
    //移行用    
    if(!locked){
        controls.enableDamping = false;
        controls.enableRotate = false;
        controls.maxDistance = Infinity;
        controls.minDistance = 0;
    }
    stick.style.display = "none";
    search.style.display = "none";
    searchres.style.display = "none";
    search.value = "";
    while(searchres.firstChild){
        searchres.removeChild(searchres.firstChild);
    }

    turn_flag = true;
    turn_info = {ahv: ahv, ocv: ocv, oav: oav, theta: theta, oiv:oiv, cnt1: 1, cnt2: 0, rad: Math.PI*0.25, to: to};
    console.log(turn_info);
}

function move_camera(){ //3dの時のみ実行
    if(!turn_flag) return;
    let diff1;
    //初期->45度
    if(turn_info.rad) diff1 = ease_diff(turn_info.theta, turn_info.rad, 0.01);
    //45度->0度
    else{
        diff1 = (turn_info.theta - Math.PI*0.25 -0.1)*0.012;
        if(turn_info.theta + diff1 < 0) diff1 = 0;
    }

    const diff2 = ease_diff(turn_info.cnt1, 0.001, 0.0057);
    const diff3 = ease_diff(turn_info.cnt2, 1, 0.01);

    if(turn_info.rad){
        turn_info.theta += diff1;
    } else {
        turn_info.theta += diff1;
    }
    turn_info.cnt1 += diff2; // 0 <= cnt1,cnt2 <= 1
    turn_info.cnt2 += diff3;

    if(!diff1 && turn_info.rad){
        turn_info.rad = 0;
    } else if(!(diff1 || diff2 || diff3)){
        //ズーム終了時の処理
        turn_flag = false;
        mode = "street";
        const theta = posi_to_theta(camera.position.z-turn_info.oav.z,camera.position.x-turn_info.oav.x);
        if(!locked){
            controls.maxDistance = 0.01;
            controls.minDistance = 0.01;
            controls.enableDamping = true;
            controls.enableRotate = true;
            street_controls_orbit.enabled = true;
            controls_orbit.enabled = false;
            // camera_target.copy(turn_info.oav);
            // camera.position.copy(turn_info.oav.clone().add(turn_info.ahv.normalize().multiplyScalar(0.01)));
            street_controls.target.set(0,0,0);
            street_camera.position.set(0.01*Math.cos(theta),0,-0.01*Math.sin(theta));
        } else {
            street_camera.position.set(0,0,0);
            street_camera.lookAt(new THREE.Vector3(-0.01*Math.cos(theta),0,0.01*Math.sin(theta)));
        }

        street_move(turn_info.to);
        //UI挿入
        container.insertAdjacentHTML("afterbegin",`
            <div id='menubar'>
                <div id='delb' onclick='del()'>
                    <div id='delbC'/></div>
                </div>

                <div id='menub' onclick='spotSerect()'>
                    <div class='menubS'></div>
                    <div class='menubS'></div>
                    <div class='menubS'></div>
                </div>

                <img src="../images/hide.png" id='changeb' onclick='better_view()'></img>

                <img src="../images/change.png" id="mode" onclick="change_mode()"></img>
            </div>

            <div id='spotviewer'>
                <div class="content" style="background-image: url(../images/link01.png); margin-left: 1%;" onclick="move(62), spotSerect()"><div class="cnts">オーバーブリッジ</div></div>
                <div class="content" style="background-image: url(../images/link02.png)" onclick="street_move(25), spotSerect()"><div class="cnts">光庭</div></div>
                <div class="content" style="background-image: url(../images/link03.png)" onclick="street_move(58), spotSerect()"><div class="cnts">食堂</div></div>
                <div class="content" style="background-image: url(../images/link04.png)" onclick="street_move(65), spotSerect()"><div class="cnts">体育館</div></div>
                <div class="content" style="background-image: url(../images/link05.png)" onclick="street_move(64), spotSerect()"><div class="cnts">講堂</div></div>
            </div>

            <div class="modep" style="display: none"></div>
        `);
        document.getElementById("menubar").addEventListener("pointerdown",()=>{ street_controls_orbit.enabled = false; });
        document.getElementById("menubar").addEventListener("pointerup",()=>{ street_controls_orbit.enabled = true; });
        return;
    }
    //カメラ移動
    const onv = new THREE.Vector3(turn_info.ocv.x, turn_info.ahv.length()*Math.tan(turn_info.theta)+turn_info.oav.y, turn_info.ocv.z);
    camera.position.copy( turn_info.oav.clone().multiplyScalar(1-turn_info.cnt1)
                        .add(onv.multiplyScalar(turn_info.cnt1)));

    //target 移動
    if(!locked)controls.target.copy(turn_info.oav.clone().multiplyScalar(turn_info.cnt2)    //線分IAをcnt2:(1-cnt2)で内分
                        .add(turn_info.oiv.clone().multiplyScalar(1-turn_info.cnt2)));
    else camera.lookAt(turn_info.oav.clone().multiplyScalar(turn_info.cnt2)
                        .add(turn_info.oiv.clone().multiplyScalar(1-turn_info.cnt2)));
}

//画面変更・位置更新(global)
let cur;
window.street_move = (async (to) => {
    arrows.forEach((val) => {street_scene.remove(val);});
    cur = to;
    if(street_mode == 1 || posi_line[to][3] == 1){
        await load_picture(to,0);
        sphere.material.map = images[to][0];
    } else {
        await load_picture(to,1);
        sphere.material.map = images[to][1];
    }
    sphere.material.needsUpdate = true;
    // street_controls.enableDamping = false;
    // street_controls.dampingFactor = 0.2;
    // floor = posi[to][2];

    //矢印・minimap更新
    generate_arrows(to);
    // cancelAnimationFrame(callbackdraw);
    // draw();
    // mini_button(to);
});

let move_groups_flag = false; //move_groupsを回すフラグ
let add_later = false; //groupを動かし終わってからの動作のフラグ
function move_groups(){ //3dモデル操作中のみ実行
    if(!move_groups_flag) return;

    //上に行くものの中で最小の番号
    let num;
    if(state == "closed") num = groups_len;
    else num = state+1;

    //移動
    let up = false, down = false;
    for(let i = groups_len-1; i >= 1; i--){
        if(state == "closed" || groups[state].part_of != groups[i].part_of){ //非選択又は別校舎
            if(groups[i].position.y > groups[i].ori_position.y){
                down = true;
                groups[i].position.y += ease_diff(groups[i].position.y, groups[i].ori_position.y, 0.08);
            }
        } else if(i >= num && groups[i].position.y < max_alt+groups[i].ori_position.y){ //同校舎かつ上がる階
            up = true;
            groups[i].position.y += ease_diff(groups[i].position.y, max_alt+groups[i].ori_position.y, 0.05);
        } else if(i < num && groups[i].position.y > groups[i].ori_position.y){ //同校舎かつ下がる階
            down = true;
            groups[i].position.y += ease_diff(groups[i].position.y, groups[i].ori_position.y, 0.08);
        }
    }

    if(!up && !down){ //移動終了時の処理
        move_groups_flag = false;
        if(add_later){
            delete_buttons();
            generate_buttons(state);
            add_later = false;
        }
    }
}

function ease_diff(cur,goal,speed){ //返り値はイージングされた速度の変化量
    speed *= ratio;
    const a = (goal-cur)*speed;
    if(a >= 0){
        return Math.min( a+speed*0.3, goal-cur );
    } else {
        return Math.max( a-speed*0.3, goal-cur );
    }
}

function move_camera_target(){
    if(turn_flag) return;
    const dvec = new THREE.Vector3(0,0,0);
    if(!user_phone){ //スマホ以外
        // if(key_flag[0]) dvec.add(front);
        // if(key_flag[1]) dvec.add(front.clone().negate());
        // if(key_flag[2]) dvec.add(side);
        // if(key_flag[3]) dvec.add(side.clone().negate());
        // if(key_flag[4]) dvec.add(up);
        // if(key_flag[5]) dvec.add(up.clone().negate());
        // dvec.normalize();
        // if ( controls.isLocked === true ) {
            const _vector = new THREE.Vector3();
            const right = _vector.setFromMatrixColumn( camera.matrix, 0 ).clone();
            const forward = _vector.crossVectors( camera.up, _vector );
            if (key_flag[0]) dvec.add(forward);
            if (key_flag[1]) dvec.add(forward.negate());
            if (key_flag[2]) dvec.add(right);
            if (key_flag[3]) dvec.add(right.negate());
            if (key_flag[4]) dvec.add(camera.up);
            if (key_flag[5]) dvec.add(camera.up.clone().negate());
        // }
    } else { //スマホ
        //計算を改良すべし
        // const ey = new THREE.Vector3(0,1,0);
        const c = camera_target.clone().sub(camera.position);
        const eX = (new THREE.Vector3(c.x,0,c.z)).normalize(); //eX=(0,0,0)を防ぐためにupベクトル求める
        const X = eX.x!=0 ? c.x/eX.x : c.z/eX.z;
        const y = c.y;                                        //θ=90°のため (p,q)=(-y,x)
        const up = (new THREE.Vector3(-y*eX.x, X, -y*eX.z)).normalize(); //上向きベクトル

        const side = c.clone().normalize().cross(up); // |side| = 1
        const front = c.normalize();

        stick_canvas.clearRect(0,0,stick.width,stick.height);
        let ocv;
        const max = stick.width*0.2;
        if(stick_flag){
            ocv = curv.clone().sub(oriv);
            if(ocv.length() > max) ocv.normalize().multiplyScalar(max);
        } else {
            ocv = new THREE.Vector2(0,0);
        }

        const dxy = new THREE.Vector2(stick.width*0.25,stick.height*0.25).add(new THREE.Vector2(ocv.y,ocv.x));
        stick_canvas.drawImage(stick_imgs[1], stick.width*0.05, stick.height*0.05, stick.width*0.9, stick.height*0.9);
        stick_canvas.drawImage(stick_imgs[0], dxy.x, dxy.y, stick.width*0.5, stick.height*0.5);

        const len = ocv.length();
        ocv.normalize().multiplyScalar(len/max);
        dvec.add(front.clone().multiplyScalar(-ocv.x)).add(side.clone().multiplyScalar(ocv.y));
    }

    const t = camera_target.clone().add(dvec);
    const p = camera.position.clone().add(dvec);
    if(t.y < 0.1){
        const d = new THREE.Vector3(0,0.1-t.y,0);
        t.add(d);
        p.add(d);
    }
    if(t.length() > 398){
        const maxv = t.clone().normalize().multiplyScalar(398);
        const d = t.clone().sub(maxv);
        t.sub(d);
        p.sub(d);
    }
    camera_target = t;
    camera.position.copy(p);
}

function handleResize() {
    width = document.documentElement.clientWidth;
    height = document.documentElement.clientHeight;
     //canvas更新

    if(width >= height){
        hrate = 0.50;
        high = 30;
        // if(mapz != 0.9){
        //     mapz = 0.9;
        //     if(view_cnt != -1) mini_button(cur);
        // }
    } else {
        hrate = 0.25;
        high = 20;
        // if(mapz != 0.6){
        //     mapz = 0.6;
        //     if(view_cnt != -1) mini_button(cur);
        // }
    }

    stick.width = `${height * hrate}`; stick.height = `${stick.width}`;
    oriv.set(height-stick.height*0.5, stick.width*0.5);
    // scwidth = stick.width; scheight = stick.height;

    // minibutton.style.width = `${height * hrate}px`; minibutton.style.height = `${height * hrate * mapas}px`;

    if(mode == "street"){
        document.getElementById("spotviewer").style.height = `${high}%`;
        if(view_cnt == -1){
            document.getElementById("menubar").style.top = `-${high}%`;
            document.getElementById("spotviewer").style.top = `-${high}%`;
        } else {
            document.getElementById("menubar").style.top = `calc(${(spot+1)*high*0.5}% + 4px)`;
            document.getElementById("spotviewer").style.top = `${(spot-1)*high*0.5}%`;
        }
    }

    //レンダラーサイズ変更
    renderer.setSize(width, height);
    //カメラアスペクト比変更
    // if(mode == "3d"){ //3dモデル操作中
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    // } else { //streetview操作中
        street_camera.aspect = width / height;
        street_camera.updateProjectionMatrix();
    // }
}

const stick_imgs_srcs = ["../images/stick.png","../images/stick_background.png"];
let stick_imgs = [undefined,undefined];
(async ()=>{
    function imgload(number){
        return new Promise((resolve)=>{
            let img = new Image();
            img.src = stick_imgs_srcs[number];
            img.addEventListener("load", ()=>{
                stick_imgs[number] = img;
                resolve();
            });
        });
    }
    await Promise.all([imgload(0),imgload(1)]);
    requestAnimationFrame(render);              //画像読み込み終了後開始
})();

let last_time = 0;
let ratio = 1;
let true_cnt = 0;
let false_cnt = 0;
let limited = false;
function timeCheck() { //20fps未満は解像度下げる
    const fps60 = 1000 / 60;
    const timed = new Date().getTime() - last_time;
    ratio = timed / fps60;
    if(ratio > 3){
        true_cnt++;
        if(true_cnt > 10){
            const cur_pixelRatio = window.devicePixelRatio;
            if(cur_pixelRatio > 1) renderer.setPixelRatio(1);
            else renderer.setPixelRatio(0.5);

            // if(mode == "3d") controls.rotateSpeed = 0.6*3; //視点の速さ 遅れ修正
            // else street_controls.rotateSpeed = 0.6*3;

            true_cnt = 0; false_cnt = 0;
            limited = true;
        }
    } else {
        false_cnt++;
        if(false_cnt > 10){
            renderer.setPixelRatio(window.devicePixelRatio);
            true_cnt = 0; false_cnt = 0;
            limited = false;
        }
    }
}

let render_cnt = 1;
function render() {
    requestAnimationFrame(render);
    if(mode == "3d"){ //3dモデル操作中
        move_camera();
        move_groups();
        move_camera_target();
        if(!locked){
            if(!turn_flag) controls.target.copy(camera_target);
            controls.update(); //ここでupdate
        }
        renderer.render(scene, camera);
    } else { //street view 中
        if(!locked) street_controls.update(); //直前でupdate
        renderer.render(street_scene, street_camera);
        let x,z;
        if(!locked){
            x = -street_camera.position.x
            z = -street_camera.position.z;
        } else {
            const vec = street_controls.getDirection(new THREE.Vector3()).multiplyScalar(0.01);
            x = vec.x;
            z = vec.z;
        }
        //矢印の移動
        for (let i = 0; i < arrows.length; ++i) arrows[i].position.set(150*x+originposi[i][0], -1.3-i*0.001, 150*z+originposi[i][1]);
    }

    timeCheck();
    if(limited){ //30fps
        render_cnt *= -1;
        if(render_cnt > 0) return;
    }
    last_time = new Date().getTime();
}