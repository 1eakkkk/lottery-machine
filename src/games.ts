export type GameId = 'ssq' | 'dlt' | 'fc3d' | 'qlc' | 'kl8';
type GameConfig={title:string;model:string;counts:number[];draws:number[];zones:string[];mixing:'mechanical'|'airflow';colors:string[];description:string;offsets:number[];reference:string};
export const GAMES:Record<GameId,GameConfig> = {
 ssq:{title:'双色球',model:'ssq-mechanical-v2',counts:[33,16],draws:[6,1],zones:['红球','蓝球'],mixing:'mechanical',colors:['#b83029','#16368f'],offsets:[-1.45,1.45],reference:'https://www.ryo-catteau.com/en/myosotis.htm',description:'两组机械转盘逆向旋转，通过碰撞混合球组。先抽取六个红球，再抽取一个蓝球。'},
 dlt:{title:'大乐透',model:'dlt-airflow-v5',counts:[35,12],draws:[5,2],zones:['前区','后区'],mixing:'airflow',colors:['#171b21','#eeeee7'],offsets:[-1.45,1.45],reference:'https://www.lottery.gov.cn/lskjsp/video.html#2026-10-05',description:'前区黑球、后区白球，均印黄色号码。周边管装球，气流渐强；上部机械捕球后向左转送，沿球仓外侧透明通道与底部弯道滚入单列接球架。参考官方回放，捕球机构尺寸与气流为近似模拟。'},
 fc3d:{title:'福彩 3D',model:'fc3d-airflow-v3',counts:[10,10,10],draws:[1,1,1],zones:['百位','十位','个位'],mixing:'airflow',colors:['#b83029','#ad790f','#16368f'],offsets:[-2.9,0,2.9],reference:'https://www.akanis.tech/',description:'百位、十位、个位各有独立的 0—9 球组，依次启动气流混合并抽取一个数字。不同球仓可以抽到相同数字，0 保留在原来的位置。'},
 qlc:{title:'七乐彩',model:'qlc-mechanical-v2',counts:[30],draws:[8],zones:['号码'],mixing:'mechanical',colors:['#b83029'],offsets:[0],reference:'https://www.ryo-catteau.com/en/ipomee.htm',description:'同一球仓装入 01—30 号球，机械混合后依次抽出七个基本号码，再从剩余球中抽出一个特别号码。八个号码不重复。'},
 kl8:{title:'快乐 8',model:'kl8-mechanical-v2',counts:[80],draws:[20],zones:['号码'],mixing:'mechanical',colors:['#b83029'],offsets:[0],reference:'https://www.ryo-catteau.com/en/stresa.htm',description:'80 个号码球在同一个球仓内通过双向机械搅拌混合，逐一抽取 20 个号码，不放回。加长接球槽在开奖过程中依次承接所有球体。'},
};
export function gameId(value:string|null):GameId {return value&&Object.hasOwn(GAMES,value)?value as GameId:'ssq';}
export function receivingTray(game:GameId) {return game==='dlt'?{centerX:-.35,halfLength:1.1,halfWidth:.095,y:1.03,slope:.10,wallY:1.28,wallHalfHeight:.32}:game==='kl8'?{centerX:-1.7,halfLength:2.1,halfWidth:.095,y:.70,slope:.04,wallY:.83,wallHalfHeight:.175}:{centerX:-.5,halfLength:.9,halfWidth:.095,y:.63,slope:.10,wallY:.83,wallHalfHeight:.175};}
export function eventZone(event:{color:string;zone?:number}) {return event.zone??(event.color==='blue'?1:0);}
