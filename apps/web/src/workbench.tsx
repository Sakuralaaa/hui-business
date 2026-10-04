import {useCallback,useEffect,useState} from 'react';
import {App,Button,Form,Input,Select,Tag,Space,Spin,Alert,Card} from 'antd';
import {DashboardOutlined,InboxOutlined,ShopOutlined,TeamOutlined,FileTextOutlined,ShoppingCartOutlined,DatabaseOutlined,DollarOutlined,BulbOutlined,SettingOutlined,PictureOutlined,CheckSquareOutlined,LogoutOutlined,MenuOutlined,ArrowRightOutlined} from '@ant-design/icons';
import {api,post} from './api';
import {Dashboard,Records,IntakePage,Reports,Actions,ContentStudio,ImageStudio,Settings,Templates} from './views';
export type ShellProps={shop:any;enterprise:any;role:string;refresh:()=>void};
const NAV=[
 {key:'dashboard',title:'经营概览',icon:<DashboardOutlined/>,group:'工作台'},
 {key:'intake',title:'数据接收中心',icon:<InboxOutlined/>,group:'工作台'},
 {key:'products',title:'商品与供应商',icon:<ShopOutlined/>,group:'经营'},
 {key:'b2b',title:'B2B 商机',icon:<TeamOutlined/>,group:'经营'},
 {key:'retail',title:'零售与履约',icon:<ShoppingCartOutlined/>,group:'经营'},
 {key:'inventory',title:'采购与库存',icon:<DatabaseOutlined/>,group:'经营'},
 {key:'finance',title:'资金与费用',icon:<DollarOutlined/>,group:'经营'},
 {key:'content',title:'内容工作室',icon:<FileTextOutlined/>,group:'智能协作'},
 {key:'images',title:'图片资产',icon:<PictureOutlined/>,group:'智能协作'},
 {key:'reports',title:'分析与证据',icon:<BulbOutlined/>,group:'智能协作'},
 {key:'actions',title:'行动与跟进',icon:<CheckSquareOutlined/>,group:'智能协作'},
 {key:'templates',title:'模板与知识',icon:<FileTextOutlined/>,group:'智能协作'},
 {key:'settings',title:'企业与模型设置',icon:<SettingOutlined/>,group:'管理'}
];
export function Workbench(){
 const {message}=App.useApp();const [session,setSession]=useState<any>(null),[loading,setLoading]=useState(true),[tenant,setTenant]=useState(localStorage.getItem('workbench-enterprise')??''),[shops,setShops]=useState<any[]>([]),[shopId,setShopId]=useState(''),[nav,setNav]=useState('dashboard'),[mobile,setMobile]=useState(false),[tick,setTick]=useState(0),[loginBusy,setLoginBusy]=useState(false);
 const refresh=useCallback(()=>setTick(t=>t+1),[]);
 useEffect(()=>{api('/auth/me').then(s=>{setSession(s);if(!s.memberships.some((m:any)=>m.enterpriseId===tenant)){const id=s.memberships[0]?.enterpriseId??'';localStorage.setItem('workbench-enterprise',id);setTenant(id);}}).catch(()=>setSession(null)).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(!session||!tenant)return;api('/shops').then(s=>{setShops(s);setShopId(current=>s.some((x:any)=>x.id===current)?current:s[0]?.id??'');}).catch(e=>message.error(e.message));},[tenant,session,tick]);
 const membership=session?.memberships.find((m:any)=>m.enterpriseId===tenant),enterprise=membership?.enterprise,shop=shops.find(s=>s.id===shopId);
 async function login(values:any){setLoginBusy(true);try{const s=await post('/auth/login',values);setSession(s);const id=s.memberships[0]?.enterpriseId??'';localStorage.setItem('workbench-enterprise',id);setTenant(id);}catch(e:any){message.error(e.message);}finally{setLoginBusy(false);}}
 if(loading)return <div className="loading-screen"><Spin size="large"/></div>;
 if(!session)return <div className="login"><div className="login-story"><div className="brand-mark">汇</div><h1>从原始数据<br/>到经营行动。</h1><p>连接每一次询盘、每一笔订单和每一个决策。</p><div className="login-features"><span>◉ B2B 与零售</span><span>◉ 数据可追溯</span><span>◉ 独立部署</span></div></div><Card className="login-card"><Tag color="cyan">HUI BUSINESS</Tag><h2>登录经营工作台</h2><p className="muted">使用管理员配置或邀请创建的账号</p><Form layout="vertical" onFinish={login}><Form.Item label="邮箱" name="email" rules={[{required:true,type:'email'}]}><Input size="large" autoComplete="username"/></Form.Item><Form.Item label="密码" name="password" rules={[{required:true}]}><Input.Password size="large" autoComplete="current-password"/></Form.Item><Button block size="large" type="primary" htmlType="submit" loading={loginBusy}>进入工作台 <ArrowRightOutlined/></Button></Form><details className="invite-entry"><summary>接受成员邀请</summary><Form layout="vertical" onFinish={async v=>{try{await post('/auth/accept-invite',v);message.success('账号已创建，请使用邀请邮箱登录');}catch(e:any){message.error(e.message);}}}><Form.Item label="邀请凭据" name="token" rules={[{required:true}]}><Input.Password/></Form.Item><Form.Item label="姓名" name="name" rules={[{required:true}]}><Input/></Form.Item><Form.Item label="密码（至少 12 位）" name="password" rules={[{required:true,min:12}]}><Input.Password/></Form.Item><Button htmlType="submit">创建账号</Button></Form></details></Card></div>;
 const props:ShellProps={shop,enterprise,role:membership?.role??'viewer',refresh};let view;
 if(!shop&&nav!=='settings')view=<Card><h2>创建你的第一个店铺</h2><p>选择「企业与模型设置」添加店铺，再创建数据采集任务。</p><Button type="primary" onClick={()=>setNav('settings')}>配置企业</Button></Card>;
 else switch(nav){
 case 'dashboard':view=<Dashboard {...props}/>;break;
 case 'intake':view=<IntakePage {...props}/>;break;
 case 'products':view=<Records {...props} datasets={['products','suppliers','customers']}/>;break;
 case 'b2b':view=<Records {...props} datasets={['inquiries','quotes','samples','customers']}/>;break;
 case 'retail':view=<Records {...props} datasets={['orders','order_lines']}/>;break;
 case 'inventory':view=<Records {...props} datasets={['inventory','purchases']}/>;break;
 case 'finance':view=<Records {...props} datasets={['payments','expenses']}/>;break;
 case 'content':view=<ContentStudio {...props}/>;break;
 case 'images':view=<ImageStudio {...props}/>;break;
 case 'reports':view=<Reports {...props}/>;break;
 case 'actions':view=<Actions {...props}/>;break;
 case 'templates':view=<Templates {...props}/>;break;
 default:view=<Settings {...props}/>;
 }
 return <div className={`shell ${mobile?'mobile-open':''}`}><aside className="sidebar"><div className="brand"><span className="brand-mark">汇</span><div>汇商工作台<small>HUI BUSINESS</small></div></div><div className="workspace-label">跨境经营 · 自主掌控</div><nav>{NAV.map((n,i)=><div key={n.key}>{NAV[i-1]?.group!==n.group&&<div className="nav-group">{n.group}</div>}<button aria-label={n.title} className={nav===n.key?'nav-item active':'nav-item'} onClick={()=>{setNav(n.key);setMobile(false);}}>{n.icon}<span>{n.title}</span>{nav===n.key&&<i/>}</button></div>)}</nav><div className="sidebar-foot"><span className="status-dot"/> 文件接入已启用<small>平台连接能力以实际授权为准</small></div></aside><div className="main-area"><header><Button className="mobile-toggle" type="text" icon={<MenuOutlined/>} onClick={()=>setMobile(!mobile)}/><span className="breadcrumb">经营空间 <span>/</span> {NAV.find(n=>n.key===nav)?.title}</span><Space wrap><Select className="enterprise-select" value={tenant} onChange={id=>{localStorage.setItem('workbench-enterprise',id);setTenant(id);}} options={session.memberships.map((m:any)=>({value:m.enterpriseId,label:m.enterprise.name}))}/><Select placeholder="选择店铺" value={shopId||undefined} onChange={setShopId} options={shops.map(s=>({value:s.id,label:s.name}))}/><Button type="text" icon={<LogoutOutlined/>} onClick={async()=>{await post('/auth/logout',{});setSession(null);}}>退出</Button></Space></header><main key={tenant+shopId+nav}><div className="page-title"><div><div className="eyebrow">CROSS-BORDER OPERATIONS</div><h1>{NAV.find(n=>n.key===nav)?.title}</h1></div><Space><Tag>{membership?.role}</Tag>{enterprise?.mode==='demo'&&<Tag color="orange">模拟数据演示</Tag>}</Space></div>{enterprise?.mode==='demo'&&<Alert className="demo-banner" type="info" showIcon message="当前为空间隔离的模拟数据。店铺接入和 Accio 导出能力尚未验证。"/>}{view}</main><footer>数据有依据，行动可追踪。<span>Hui Business · 0.1</span></footer></div></div>;
}
