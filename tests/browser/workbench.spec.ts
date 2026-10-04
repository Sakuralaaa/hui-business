import {test,expect} from '@playwright/test';
test('login, isolated demo, business pages and content check',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('邮箱',{exact:true}).fill(process.env.BOOTSTRAP_EMAIL!);await page.getByLabel('密码',{exact:true}).fill(process.env.BOOTSTRAP_PASSWORD!);await page.getByRole('button',{name:'进入工作台'}).click();
 await expect(page.locator('.sidebar')).toBeVisible();await page.locator('.enterprise-select').click();await page.locator('.ant-select-dropdown').getByText('演示 · 海川工贸',{exact:true}).click();
 await expect(page.getByText('当前为空间隔离的模拟数据。店铺接入和 Accio 导出能力尚未验证。')).toBeVisible();
 await page.screenshot({path:'artifacts/dashboard.png',fullPage:true});
 for(const title of ['商品与供应商','B2B 商机','零售与履约','采购与库存','资金与费用','数据接收中心','分析与证据','行动与跟进','模板与知识']){
  await page.locator('.sidebar').getByRole('button',{name:title,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.locator('main .ant-card').first()).toBeVisible();
 }
 await page.locator('.sidebar').getByRole('button',{name:'内容工作室',exact:true}).click();await page.getByLabel('标题',{exact:true}).first().fill('Travel bottle');await page.getByLabel('描述',{exact:true}).first().fill('Confirmed product description');await page.getByRole('button',{name:'检查文案',exact:true}).click();await expect(page.getByText('检查结果',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/content-studio.png',fullPage:true});
 expect(errors).toEqual([]);
});
