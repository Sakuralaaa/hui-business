import React from 'react';
import {createRoot} from 'react-dom/client';
import {ConfigProvider,App as AntApp} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {Workbench} from './workbench';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><ConfigProvider locale={zhCN} theme={{token:{colorPrimary:'#137e76',borderRadius:10,fontFamily:'Inter, "Microsoft YaHei", sans-serif',colorBgLayout:'#f3f6fa'}}}><AntApp><Workbench/></AntApp></ConfigProvider></React.StrictMode>);
