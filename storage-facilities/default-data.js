// Initial records transcribed from the user-provided source table.
// These records are written once only when the Firestore catalog does not exist.
export const INITIAL_STATE = {
  facilities: [
    {id:'source-1',type:'地上儲槽',site:'新港',department:'公用廠',name:'重油槽',material:'石油油品類',listedItem:'燃料油',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-1'},
    {id:'source-2',type:'地上儲槽',site:'龍德',department:'公用組',name:'重油槽TK-39',material:'石油油品類',listedItem:'燃料油',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-2'},
    {id:'source-4',type:'地上儲槽',site:'新港',department:'PABS廠',name:'T510',material:'石油油品類',listedItem:'基礎油',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-4-5'},
    {id:'source-5',type:'地上儲槽',site:'新港',department:'PABS廠',name:'T480',material:'石油油品類',listedItem:'柴油',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-4-5'},
    {id:'source-6',type:'地上儲槽',site:'新港',department:'PABS廠',name:'T411',material:'石油油品類',listedItem:'燃料油',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-6-7'},
    {id:'source-7',type:'地上儲槽',site:'新港',department:'PABS廠',name:'T412',material:'其他指定物質',listedItem:'乙苯',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-6-7'},
    {id:'source-8',type:'地上儲槽',site:'新港',department:'PABS廠',name:'NT102-1',material:'其他指定物質',listedItem:'乙苯',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-8-10'},
    {id:'source-9',type:'地上儲槽',site:'新港',department:'PABS廠',name:'NT102-2',material:'其他指定物質',listedItem:'乙苯',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-8-10'},
    {id:'source-10',type:'地上儲槽',site:'新港',department:'PABS廠',name:'NT102-3',material:'其他指定物質',listedItem:'乙苯',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-8-10'},
    {id:'source-11',type:'地上儲槽',site:'工三',department:'地毯廠',name:'T601',material:'石油油品類',listedItem:'柴油',capacity:'未滿 1,000 公秉',requirement:'需監測',groupId:'monitor-11'}
  ],
  groups: {
    'monitor-1': {methods:['土壤氣體監測'],wells:17,months:[1,5,9],alternative:'2027/5開始申報',result:''},
    'monitor-2': {methods:['土壤氣體監測'],wells:0,months:[1,5,9],alternative:'排定2026年6月完工驗收',result:''},
    'monitor-4-5': {methods:['土壤氣體監測'],wells:23,months:[1,5,9],alternative:'',result:'已於5/25申報完成。監測濃度皆<5 PPM。符合<500 PPM之規定'},
    'monitor-6-7': {methods:['土壤氣體監測'],wells:34,months:[1,5,9],alternative:'2027/5開始申報',result:''},
    'monitor-8-10': {methods:['土壤氣體監測'],wells:33,months:[1,5,9],alternative:'2027/5開始申報',result:''},
    'monitor-11': {methods:['土壤氣體監測'],wells:5,months:[1,5,9],alternative:'',result:'已於5/26申報完成。監測濃度最高14PPM。符合<500 PPM之規定'}
  }
};
