import {useCallback,useEffect,useRef,useState} from 'react';
import {App,Button,Card,Dropdown,Form,Input,Select,Space,Spin,Tag} from 'antd';
import {HomeOutlined,TeamOutlined,ShopOutlined,ShoppingCartOutlined,EditOutlined,MoreOutlined,InboxOutlined,BulbOutlined,CheckSquareOutlined,DollarOutlined,SettingOutlined,LogoutOutlined,MenuOutlined,ArrowRightOutlined} from '@ant-design/icons';
import {api,post,setSessionExpiredHandler} from './api';
import {Dashboard,Records,IntakePage,Reports,Actions,CreationCenter,Settings} from './views';

export type ShellProps={shop:any;enterprise:any;role:string;refresh:()=>void};
const NAV=[
 {key:'dashboard',title:'首页',icon:<HomeOutlined/>},
 {key:'b2b',title:'客户与询盘',icon:<TeamOutlined/>},
 {key:'products',title:'商品与报价',icon:<ShopOutlined/>},
 {key:'orders',title:'订单与库存',icon:<ShoppingCartOutlined/>},
 {key:'creation',title:'创作中心',icon:<EditOutlined/>}
];
const MORE=[
 {key:'reports',title:'经营分析',icon:<BulbOutlined/>},
 {key:'actions',title:'待办与跟进',icon:<CheckSquareOutlined/>},
 {key:'finance',title:'资金与费用',icon:<DollarOutlined/>},
 {key:'settings',title:'企业设置',icon:<SettingOutlined/>}
];
const TITLES=Object.fromEntries([...NAV,...MORE,{key:'intake',title:'导入资料'}].map(item=>[item.key,item.title]));
const ROLE_LABELS:Record<string,string>={owner:'企业所有者',admin:'管理员',sales:'销售',operations:'运营',finance:'财务',viewer:'只读成员'};

export function Workbench(){
 const {message}=App.useApp();
 const [session,setSession]=useState<any>(null),[loading,setLoading]=useState(true),[tenant,setTenant]=useState(localStorage.getItem('workbench-enterprise')??''),[shops,setShops]=useState<any[]>([]),[shopId,setShopId]=useState(''),[shopsLoading,setShopsLoading]=useState(false),[nav,setNav]=useState('dashboard'),[mobile,setMobile]=useState(false),[tick,setTick]=useState(0),[loginBusy,setLoginBusy]=useState(false),[welcome,setWelcome]=useState(false);
 const shopRequest=useRef(0),sessionRef=useRef<any>(null);
 sessionRef.current=session;
 const refresh=useCallback(()=>setTick(t=>t+1),[]);
 useEffect(()=>setSessionExpiredHandler(()=>{if(sessionRef.current)setSession(null);}),[]);
 useEffect(()=>{let live=true;api('/auth/me').then(s=>{if(!live)return;setSession(s);const saved=localStorage.getItem('workbench-enterprise')??'';if(s.memberships.some((m:any)=>m.enterpriseId===saved)){setTenant(saved);}else{localStorage.removeItem('workbench-enterprise');setTenant('');setWelcome(s.memberships.length>0);}}).catch(()=>{if(live)setSession(null);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
 useEffect(()=>{
   const request=++shopRequest.current;
   if(!session||!tenant){setShops([]);setShopId('');setShopsLoading(false);return;}
   setShopsLoading(true);
   api('/shops').then(rows=>{if(request!==shopRequest.current)return;setShops(rows);setShopId(current=>rows.some((row:any)=>row.id===current)?current:rows[0]?.id??'');}).catch(e=>{if(request===shopRequest.current)message.error(e.message);}).finally(()=>{if(request===shopRequest.current)setShopsLoading(false);});
   return()=>{if(request===shopRequest.current)shopRequest.current++;};
 },[tenant,session,tick,message]);
 async function login(values:any){setLoginBusy(true);try{const s=await post('/auth/login',values);setSession(s);const saved=localStorage.getItem('workbench-enterprise')??'';if(s.memberships.some((m:any)=>m.enterpriseId===saved)){setTenant(saved);}else{setTenant('');setWelcome(s.memberships.length>0);}}catch(e:any){message.error(e.message);}finally{setLoginBusy(false);}}
 function chooseEnterprise(id:string){localStorage.setItem('workbench-enterprise',id);setShops([]);setShopId('');setTenant(id);setWelcome(false);setNav('dashboard');}
 if(loading)return <div className="loading-screen"><Spin size="large"/></div>;
 if(!session)return <div className="login"><div className="login-story"><div className="brand-mark">汇</div><h1>把经营资料<br/>变成下一步行动。</h1><p>询盘、商品、订单和创作内容，放在一个清楚好用的工作台。</p><div className="login-features"><span>◉ B2B 与零售</span><span>◉ 数据可追溯</span><span>◉ 人工确认后执行</span></div></div><Card className="login-card"><Tag color="cyan">汇商工作台</Tag><h2>登录经营工作台</h2><p className="muted">使用管理员配置或邀请创建的账号</p><Form layout="vertical" onFinish={login}><Form.Item label="邮箱" name="email" rules={[{required:true,type:'email',message:'请输入有效邮箱'}]}><Input size="large" autoComplete="username"/></Form.Item><Form.Item label="密码" name="password" rules={[{required:true,message:'请输入密码'}]}><Input.Password size="large" autoComplete="current-password"/></Form.Item><Button block size="large" type="primary" htmlType="submit" loading={loginBusy}>进入工作台 <ArrowRightOutlined/></Button></Form><details className="invite-entry"><summary>接受成员邀请</summary><Form layout="vertical" onFinish={async v=>{try{await post('/auth/accept-invite',v);message.success('账号已创建，请使用邀请邮箱登录');}catch(e:any){message.error(e.message);}}}><Form.Item label="邀请凭据" name="token" rules={[{required:true}]}><Input.Password/></Form.Item><Form.Item label="姓名" name="name" rules={[{required:true}]}><Input/></Form.Item><Form.Item label="密码（至少 12 位）" name="password" rules={[{required:true,min:12,message:'密码至少需要 12 位'}]}><Input.Password/></Form.Item><Button htmlType="submit">创建账号</Button></Form></details></Card></div>;
 const membership=session.memberships.find((m:any)=>m.enterpriseId===tenant),enterprise=membership?.enterprise,shop=shops.find(s=>s.id===shopId);
 if(welcome){const demo=session.memberships.find((m:any)=>m.enterprise.mode==='demo'),own=session.memberships.find((m:any)=>m.enterprise.mode!=='demo');return <div className="welcome-screen"><div className="welcome-brand"><span className="brand-mark">汇</span><div><b>汇商工作台</b><small>先选择一个经营空间</small></div></div><h1>你想怎么开始？</h1><p className="muted">演示空间可以先熟悉询盘、报价、订单和创作流程。之后也能随时切换。</p><div className="welcome-options">{demo&&<Card className="welcome-card demo-choice"><div className="welcome-icon">试</div><h2>先体验演示数据</h2><p>查看预设的阿里国际站商品、询盘、订单和经营示例，不影响真实资料。</p><Button type="primary" size="large" onClick={()=>chooseEnterprise(demo.enterpriseId)}>进入演示空间 <ArrowRightOutlined/></Button></Card>}{own&&<Card className="welcome-card"><div className="welcome-icon personal">企</div><h2>进入我的企业</h2><p>使用你自己的企业与店铺资料；没有店铺时可由管理员添加。</p><Button size="large" onClick={()=>chooseEnterprise(own.enterpriseId)}>进入我的企业</Button></Card>}</div></div>;}
 const props:ShellProps={shop,enterprise,role:membership?.role??'viewer',refresh};let view:any;
 if(!shop&&shopsLoading)view=<Card><Spin/> 正在载入店铺资料…</Card>;
 else if(!shop&&nav!=='settings')view=<Card><h2>先添加一家店铺</h2><p>进入“更多 → 企业设置”添加阿里国际站或其他渠道。演示空间可直接查看示例资料。</p><Button type="primary" onClick={()=>setNav('settings')}>打开企业设置</Button></Card>;
 else switch(nav){
  case 'dashboard':view=<Dashboard {...props}/>;break;
  case 'b2b':view=<Records {...props} datasets={['inquiries','customers','quotes','samples','tasks']}/>;break;
  case 'products':view=<Records {...props} datasets={['products','suppliers','quotes']}/>;break;
  case 'orders':view=<Records {...props} datasets={['orders','order_lines','inventory','purchases']}/>;break;
  case 'intake':view=<IntakePage {...props} onNavigate={setNav}/>;break;
  case 'creation':view=<CreationCenter {...props}/>;break;
  case 'reports':view=<Reports {...props}/>;break;
  case 'actions':view=<Actions {...props}/>;break;
  case 'finance':view=<Records {...props} datasets={['payments','expenses']}/>;break;
  default:view=<Settings {...props}/>;
 }
 const moreItems=MORE.filter(item=>item.key!=='finance'||['owner','admin','finance'].includes(props.role)).map(item=>({key:item.key,label:<span>{item.icon}<span style={{marginLeft:9}}>{item.title}</span></span>}));
 const routeTitle=TITLES[nav]??'首页';
 return <div className={`shell ${mobile?'mobile-open':''}`}>
  <aside className="sidebar"><div className="brand"><span className="brand-mark">汇</span><div>汇商工作台<small>跨境经营工作台</small></div></div><div className="workspace-label">{enterprise?.name??'经营空间'}</div>
   <nav aria-label="主导航">{NAV.slice(0,4).map(item=><button key={item.key} aria-label={item.title} className={nav===item.key?'nav-item active':'nav-item'} onClick={()=>{setNav(item.key);setMobile(false);}}>{item.icon}<span>{item.title}</span>{nav===item.key&&<i/>}</button>)}
    <div className="nav-separator"/><button aria-label="创作中心" className={`nav-item creative-nav ${nav==='creation'?'active':''}`} onClick={()=>{setNav('creation');setMobile(false);}}><EditOutlined/><span>创作中心</span><Tag color="cyan">常用</Tag>{nav==='creation'&&<i/>}</button>
    <Dropdown menu={{items:moreItems,onClick:({key})=>{setNav(key);setMobile(false);}}} trigger={['click']} placement="topLeft"><button aria-label="更多" className={`nav-item more-nav ${MORE.some(item=>item.key===nav)?'active':''}`}><MoreOutlined/><span>更多</span><i>⌄</i></button></Dropdown>
   </nav><div className="sidebar-foot"><span className="status-dot"/> 文件导入可用<small>平台连接能力以实际授权为准</small></div>
  </aside>
  {mobile&&<button className="mobile-backdrop" aria-label="关闭导航" onClick={()=>setMobile(false)}/>}
  <div className="main-area"><header><div className="header-start"><Button className="mobile-toggle" type="text" icon={<MenuOutlined/>} onClick={()=>setMobile(!mobile)}/><span className="breadcrumb">{routeTitle}</span></div><Space wrap className="header-actions"><Select aria-label="企业" className="enterprise-select" value={tenant} onChange={chooseEnterprise} options={session.memberships.map((m:any)=>({value:m.enterpriseId,label:m.enterprise.name}))}/>{shops.length>0&&<Select aria-label="店铺" placeholder="选择店铺" value={shopId||undefined} loading={shopsLoading} onChange={setShopId} options={shops.map(s=>({value:s.id,label:s.name}))}/>}<Button className="import-quick" type="primary" icon={<InboxOutlined/>} onClick={()=>setNav('intake')}>导入资料</Button><Button className="logout-button" type="text" icon={<LogoutOutlined/>} onClick={async()=>{try{await post('/auth/logout',{});}catch{}setSession(null);}}>退出</Button></Space></header>
   <main><div className="page-title"><div><div className="eyebrow">汇商工作台</div><h1>{routeTitle}</h1></div><Space wrap><Tag>{ROLE_LABELS[props.role]??'成员'}</Tag>{enterprise?.mode==='demo'&&<Tag color="orange">演示空间</Tag>}</Space></div>{enterprise?.mode==='demo'&&<div className="demo-banner">当前是演示资料，可以放心体验；不会混入自己的企业数据。店铺数据采集能力需在真实账号中验证。</div>}{view}</main><footer>数据有依据，下一步更清楚。<span>汇商工作台 · 0.2</span></footer>
  </div>
 </div>;
}
