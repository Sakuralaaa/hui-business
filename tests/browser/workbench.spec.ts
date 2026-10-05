import {test,expect} from '@playwright/test';
test('login, choose demo, simplified navigation and creation center',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('邮箱',{exact:true}).fill(process.env.BOOTSTRAP_EMAIL!);await page.getByLabel('密码',{exact:true}).fill(process.env.BOOTSTRAP_PASSWORD!);await page.getByRole('button',{name:'进入工作台'}).click();
 if(await page.getByRole('button',{name:'进入演示空间',exact:true}).count())await page.getByRole('button',{name:'进入演示空间',exact:true}).click();
 await expect(page.locator('.sidebar')).toBeVisible();
 if(await page.locator('.enterprise-select').count()){await page.locator('.enterprise-select').click();if(await page.locator('.ant-select-dropdown').getByText('演示 · 海川工贸',{exact:true}).count())await page.locator('.ant-select-dropdown').getByText('演示 · 海川工贸',{exact:true}).click();}
 await expect(page.getByText('当前是演示资料，可以放心体验；不会混入自己的企业数据。店铺数据采集能力需在真实账号中验证。')).toBeVisible();
 await page.screenshot({path:'artifacts/dashboard.png',fullPage:true});
 for(const title of ['客户与询盘','商品与报价','订单与库存','创作中心']){
  await page.locator('.sidebar').getByRole('button',{name:title,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.locator('main .ant-card').first()).toBeVisible();
 }
 await page.getByRole('tab',{name:'商品文案',exact:true}).click();await page.getByLabel('标题',{exact:true}).first().fill('Travel bottle');await page.getByLabel('描述',{exact:true}).first().fill('Confirmed product description');await page.getByRole('button',{name:'检查文案',exact:true}).click();await expect(page.getByText('文本检查分',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/content-studio.png',fullPage:true});
 await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByText('经营分析',{exact:true}).click();await expect(page.getByRole('heading',{name:'经营分析',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'导入资料',exact:true}).click();await expect(page.getByRole('heading',{name:'导入资料',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'创作中心',exact:true}).click();await expect(page.locator('body')).not.toHaveCSS('overflow-x','visible');
 expect(errors).toEqual([]);
});
