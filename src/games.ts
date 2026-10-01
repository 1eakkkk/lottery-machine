export type GameId = 'ssq' | 'dlt';
export const GAMES = {
  ssq: { title:'双色球', model:'ssq-mechanical-v2', counts:[33,16], draws:[6,1], zones:['红球','蓝球'], mixing:'mechanical', colors:['#b83029','#16368f'], description:'两组机械转盘逆向旋转，碰撞带动球体在透明球仓中搅拌。出球阀开启后，进入底部通道的球被逐一识别。六个红球之后，再抽取一个蓝球。' },
  dlt: { title:'大乐透', model:'dlt-airflow-v1', counts:[35,12], draws:[5,2], zones:['前区','后区'], mixing:'airflow', colors:['#b83029','#ad790f'], description:'风机气流带动等质量球体在透明球仓中混合。定时出球阀配合单球隔离通道，先抽出五个前区球，再抽出两个后区球；出球后依靠重力滚入接球槽。' },
} as const;
export function gameId(value: string|null): GameId {return value==='dlt'?'dlt':'ssq';}
