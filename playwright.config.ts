import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/browser',timeout:45000,use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1000},trace:'retain-on-failure'},reporter:[['list'],['html',{outputFolder:'artifacts/browser-report',open:'never'}]]});
