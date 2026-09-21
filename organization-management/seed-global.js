const initialMeta = { version:'R41', revisionDate:'2026-09-10', title:'安全衛生處組織編制表' };

const nodes = [
  {id:'president',label:'處長',x:717,y:62,w:120,h:78,headcount:1,parent:null,level:'經理級'},
  {id:'safety-vp',label:'工安副處長',x:545,y:150,w:115,h:58,headcount:1,parent:'president',level:'一級主管'},
  {id:'office',label:'處務室',x:720,y:150,w:100,h:50,headcount:1,parent:'president',level:'一級主管'},
  {id:'env-vp',label:'環保副處長',x:1110,y:85,w:125,h:75,headcount:1,parent:'president',level:'一級主管'},
  {id:'performance',label:'績效管理',x:72,y:178,w:112,h:58,headcount:1,parent:'safety-vp',level:'基層人員'},
  {id:'longde',label:'龍德',x:225,y:178,w:112,h:58,headcount:2,parent:'safety-vp',level:'基層人員'},
  {id:'xingang',label:'新港',x:380,y:178,w:112,h:58,headcount:2,parent:'safety-vp',level:'基層人員'},
  {id:'mailiao',label:'麥寮',x:535,y:178,w:112,h:58,headcount:1,parent:'safety-vp',level:'基層人員'},
  {id:'risk',label:'風險管理',x:682,y:213,w:110,h:58,headcount:1,parent:'office',level:'基層人員'},
  {id:'psm',label:'PSM',x:832,y:213,w:110,h:58,headcount:1,parent:'office',level:'基層人員'},
  {id:'fire',label:'消防管理',x:980,y:213,w:110,h:58,headcount:1,parent:'office',level:'基層人員'},
  {id:'health',label:'健康管理',x:1128,y:213,w:110,h:58,headcount:4,parent:'office',level:'基層人員'},
  {id:'environment',label:'環保管理',x:1277,y:213,w:110,h:58,headcount:4,parent:'env-vp',level:'基層人員'},
  {id:'chem1',label:'化一部\n含保養處',x:660,y:330,w:115,h:70,headcount:2,parent:'mailiao',level:'基層人員'},
  {id:'chem2',label:'化二部\n含保養處',x:800,y:330,w:115,h:70,headcount:2,parent:'mailiao',level:'基層人員'},
  {id:'chem3',label:'化三部\n含保養處',x:940,y:330,w:115,h:70,headcount:2,parent:'mailiao',level:'基層人員'},
  {id:'direct',label:'直屬單位+\n工事處',x:1080,y:330,w:115,h:70,headcount:3,parent:'mailiao',level:'基層人員'},
  {id:'plastic',label:'塑膠部\n含保養處',x:1220,y:330,w:115,h:70,headcount:3,parent:'mailiao',level:'基層人員'},
  {id:'env-xingang',label:'環保組\n(新港/彰化)',x:1220,y:470,w:120,h:70,headcount:2,parent:'environment',level:'基層主管'},
  {id:'env-mailiao',label:'環保組\n麥寮',x:1360,y:470,w:120,h:70,headcount:4,parent:'environment',level:'基層主管'},
  {id:'taipei',label:'安衛處(台北)',x:90,y:440,w:120,h:65,headcount:1,parent:'performance',level:'基層人員'},
  {id:'contract',label:'定期契約人員',x:520,y:620,w:120,h:70,headcount:4,parent:'office',level:'定期契約人員'},
  {id:'training',label:'培訓人員',x:660,y:620,w:120,h:70,headcount:4,parent:'office',level:'培訓人員'}
];

const staff = [
  {id:'s001',name:'馮吉宏',title:'處長',unit:'安全衛生處',joinMonth:'2004/8',level:'經理級',employeeType:'正式',status:'active',nodeId:'president',version:'R41'},
  {id:'s002',name:'鄭鎮杰',title:'環保副處長',unit:'環保管理',joinMonth:'2007/1',level:'一級主管',employeeType:'正式',status:'active',nodeId:'env-vp',version:'R41'},
  {id:'s003',name:'王家宏',title:'安衛高工師',unit:'績效管理',joinMonth:'1990/2',level:'基層人員',employeeType:'正式',status:'active',nodeId:'performance',version:'R41'},
  {id:'s004',name:'詹益昌',title:'安衛高工師',unit:'龍德',joinMonth:'2007/6',level:'基層人員',employeeType:'正式',status:'active',nodeId:'longde',version:'R41'},
  {id:'s005',name:'許嘉方',title:'事務人員',unit:'處務室',joinMonth:'1996/12',level:'事務人員',employeeType:'正式',status:'active',nodeId:'office',version:'R41'},
  {id:'s006',name:'王智寬',title:'消防資工師',unit:'消防管理',joinMonth:'2011/9',level:'基層人員',employeeType:'正式',status:'active',nodeId:'fire',version:'R41'},
  {id:'s007',name:'林余津',title:'安衛工程師',unit:'化一部',joinMonth:'2011/11',level:'基層人員',employeeType:'正式',status:'active',nodeId:'chem1',version:'R41'},
  {id:'s008',name:'陳曉琪',title:'安衛管理員',unit:'化一部',joinMonth:'2011/11',level:'基層人員',employeeType:'正式',status:'active',nodeId:'chem1',version:'R41'},
  {id:'s009',name:'林瑋新',title:'安衛工程師',unit:'化二部',joinMonth:'2023/8',level:'基層人員',employeeType:'正式',status:'active',nodeId:'chem2',version:'R41'},
  {id:'s010',name:'穆柏勳',title:'安衛高工師',unit:'化三部',joinMonth:'2015/4',level:'基層人員',employeeType:'正式',status:'active',nodeId:'chem3',version:'R41'},
  {id:'s011',name:'陳芋蓁',title:'健康管理師',unit:'健康管理',joinMonth:'2012/03',level:'基層人員',employeeType:'正式',status:'active',nodeId:'health',version:'R41'},
  {id:'s012',name:'潘姮君',title:'健康管理員',unit:'健康管理',joinMonth:'2012/03',level:'基層人員',employeeType:'正式',status:'active',nodeId:'health',version:'R41'},
  {id:'s013',name:'吳玉珍',title:'健康管理員',unit:'健康管理',joinMonth:'2012/03',level:'基層人員',employeeType:'正式',status:'active',nodeId:'health',version:'R41'},
  {id:'s014',name:'陳芋婷',title:'健康管理員',unit:'健康管理',joinMonth:'2016/06',level:'基層人員',employeeType:'正式',status:'active',nodeId:'health',version:'R41'},
  {id:'s015',name:'黃偉嘉',title:'安衛工程師',unit:'塑膠部',joinMonth:'2011/9',level:'基層人員',employeeType:'正式',status:'active',nodeId:'plastic',version:'R41'},
  {id:'s016',name:'邱炫晉',title:'安衛高工師',unit:'塑膠部',joinMonth:'1994/9',level:'基層人員',employeeType:'正式',status:'active',nodeId:'plastic',version:'R41'},
  {id:'s017',name:'陳昱綺',title:'環保高工師',unit:'環保組',joinMonth:'2022/7',level:'基層人員',employeeType:'正式',status:'active',nodeId:'env-mailiao',version:'R41'},
  {id:'s018',name:'黃淑芳',title:'安衛管理員',unit:'直屬單位+工事處',joinMonth:'1989/2',level:'基層人員',employeeType:'正式',status:'active',nodeId:'direct',version:'R41'},
  {id:'s019',name:'林谷威',title:'安衛工程師',unit:'直屬單位+工事處',joinMonth:'2012/5',level:'基層人員',employeeType:'正式',status:'active',nodeId:'direct',version:'R41'},
  {id:'s020',name:'陳欣妤',title:'健康管理員',unit:'健康管理',joinMonth:'2019/8',level:'基層人員',employeeType:'正式',status:'active',nodeId:'health',version:'R41'},
  {id:'s021',name:'吳幸娟',title:'健康管理員',unit:'健康管理',joinMonth:'2021/9',level:'基層人員',employeeType:'正式',status:'active',nodeId:'health',version:'R41'},
  {id:'s022',name:'許嘉麟',title:'組長',unit:'環保組(新港/彰化)',joinMonth:'1998/7',level:'基層主管',employeeType:'正式',status:'active',nodeId:'env-xingang',version:'R41'},
  {id:'s023',name:'蕭子昭',title:'安衛高工師',unit:'新港',joinMonth:'2012/08',level:'基層人員',employeeType:'正式',status:'active',nodeId:'xingang',version:'R41'},
  {id:'s024',name:'陳炳煌',title:'安衛工程師',unit:'新港',joinMonth:'1987/5',level:'基層人員',employeeType:'正式',status:'active',nodeId:'xingang',version:'R41'},
  {id:'s025',name:'林佩祺',title:'健康助理員',unit:'健康管理',joinMonth:'2013/9',level:'基層人員',employeeType:'正式',status:'active',nodeId:'health',version:'R41'},
  {id:'s026',name:'謝富承',title:'環保工程師',unit:'環保組(新港/彰化)',joinMonth:'1998/8',level:'基層人員',employeeType:'正式',status:'active',nodeId:'env-xingang',version:'R41'},
  {id:'s027',name:'劉志強',title:'安衛高工師',unit:'麥寮',joinMonth:'1995/4',level:'基層人員',employeeType:'正式',status:'active',nodeId:'mailiao',version:'R41'},
  {id:'s028',name:'邱柏承',title:'安衛工程師',unit:'麥寮',joinMonth:'2024/3',level:'基層人員',employeeType:'正式',status:'active',nodeId:'mailiao',version:'R41'},
  {id:'s029',name:'楊士瑩',title:'環保高工師',unit:'環保組',joinMonth:'2019/10',level:'基層人員',employeeType:'正式',status:'active',nodeId:'env-mailiao',version:'R41'},
  {id:'s030',name:'陳學融',title:'安衛高工師',unit:'麥寮',joinMonth:'2011/11',level:'基層人員',employeeType:'正式',status:'active',nodeId:'mailiao',version:'R41'},
  {id:'s031',name:'溫瑞鑫',title:'定期契約人員',unit:'安全衛生處',joinMonth:'',level:'定期契約人員',employeeType:'正式',status:'active',nodeId:'contract',version:'R41'},
  {id:'s032',name:'蔡仁正',title:'定期契約人員',unit:'安全衛生處',joinMonth:'',level:'定期契約人員',employeeType:'正式',status:'active',nodeId:'contract',version:'R41'},
  {id:'s033',name:'沈大為',title:'定期契約人員',unit:'安全衛生處',joinMonth:'',level:'定期契約人員',employeeType:'正式',status:'active',nodeId:'contract',version:'R41'},
  {id:'s034',name:'黃韻璇',title:'環保工程師',unit:'環保組',joinMonth:'2024/12',level:'基層人員',employeeType:'正式',status:'active',nodeId:'env-mailiao',version:'R41'},
  {id:'s035',name:'莊晉昌',title:'環保工程師',unit:'環保組',joinMonth:'2003/2',level:'基層人員',employeeType:'正式',status:'active',nodeId:'env-mailiao',version:'R41'},
  {id:'s036',name:'李濬霖',title:'環保高工師',unit:'環保組',joinMonth:'2002/1',level:'基層人員',employeeType:'正式',status:'active',nodeId:'env-mailiao',version:'R41'},
  {id:'s037',name:'盧晉標',title:'副組長',unit:'安衛組',joinMonth:'1998/4',level:'基層主管',employeeType:'正式',status:'active',nodeId:'office',version:'R41'},
  {id:'s038',name:'黃俊智',title:'副組長',unit:'安全衛生處',joinMonth:'2004/11',level:'基層主管',employeeType:'正式',status:'active',nodeId:'office',version:'R41'},
  {id:'s039',name:'洪巧軒',title:'安衛高工師',unit:'安衛處(台北)',joinMonth:'2021/01',level:'基層人員',employeeType:'正式',status:'active',nodeId:'taipei',version:'R41'},
  {id:'s040',name:'鄒智陽',title:'安衛管理員',unit:'安全衛生處',joinMonth:'2001/3',level:'基層人員',employeeType:'正式',status:'active',nodeId:'office',version:'R41'},
  {id:'s041',name:'吳怡萱',title:'助理工程師',unit:'安全衛生處',joinMonth:'2025/9',level:'基層人員',employeeType:'正式',status:'active',nodeId:'office',version:'R41'},
  {id:'s042',name:'蔡沂庭',title:'助理工程師',unit:'安全衛生處',joinMonth:'2026/5',level:'基層人員',employeeType:'正式',status:'active',nodeId:'office',version:'R41'},
  {id:'s043',name:'蘇鈺涵',title:'安衛工程師',unit:'環保組',joinMonth:'2024/8',level:'基層人員',employeeType:'正式',status:'active',nodeId:'env-mailiao',version:'R41'}
];

const initialVersions = [{
  id:'R41',version:'R41',revisionDate:'2026-09-10',summary:'吳念忠、沈漢威離職；蔡沂庭改助理工程師；蘇鈺涵調環保組',changeCount:4,changes:[
    {type:'離職',name:'吳念忠',field:'在職狀態',before:'在職',after:'離職'},
    {type:'離職',name:'沈漢威',field:'在職狀態',before:'在職',after:'離職'},
    {type:'修改',name:'蔡沂庭',field:'職稱',before:'',after:'助理工程師'},
    {type:'修改',name:'蘇鈺涵',field:'單位',before:'',after:'環保組'}
  ]
}];


window.EHS_ORG_SEED = { initialMeta, staff, nodes, initialVersions };
