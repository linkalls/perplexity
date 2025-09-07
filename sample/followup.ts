import { PerplexityClient } from '../src/perplexity';
import {getFirstAskTextAnswer} from '../src/types';
import { extractStreamAnswers,extractStreamBackend,extractStreamEntries } from '../src/search_helpers';

async function main() {
  // Read cookie from environment for safety (set PERPLEXITY_COOKIE to a single cookie string),
  // or leave empty for unauthenticated usage.
  const cli = new PerplexityClient({'cookie': 'pplx.visitor-id=d5a0e652-cdaf-4b22-af9c-c4d48b686554; _gcl_au=1.1.693232699.1756306503; __stripe_mid=6eec2142-a705-4abc-8780-1491397abf09584f8d; _fbp=fb.1.1756306528192.484595027658092474; __ps_r=https://accounts.google.co.jp/; __ps_lu=https://www.perplexity.ai/search/zhong-yao-nawei-du-nomeruwojia-0EFMjkl1S2Of8_dZ3E18HQ; __ps_fva=1756306528216; pplx.personal-search-badge-seen={%22sidebar%22:true%2C%22settingsSidebar%22:false%2C%22personalize%22:false}; singular_device_id=ceda91f7-7a89-434a-ba9a-2f3ad496ed49; pplx.tasks-settings-seen=true; pplx.trackingAllowed=true; pplx.session-id=953d5d19-6a2e-4cbf-ba0b-9321a5d3e2ff; pplx.browser.device-id=cc6ae52ccef6604646620d9fb7d28e8be69af3ec161d639a7f52a75185fdfb17; pplx.browser.is-local-search-enabled=true; next-auth.csrf-token=e15f50512fa3acced12be16992006843430c6209b7b6927777e6634b9a474604%7C8557c4be62ecf841cb8a0fbc5389c211faa0ebcc258f1f99699bed65889849e3; next-auth.callback-url=https%3A%2F%2Fwww.perplexity.ai%2Fapi%2Fauth%2Fsignin-callback%3Fredirect%3Dhttps%253A%252F%252Fwww.perplexity.ai; finance-alert-page-visit=1; pplx.search-mode=search; gov-badge=3; _ga_GLKMVTHEXC=GS2.1.s1756644932$o1$g0$t1756644932$j60$l0$h0; _ga=GA1.1.971378648.1756644933; IndrX2c1OFdjNG9oXzgxd1JocUVVWGFadkNMVEZaYlkzeGRCUlRlR1JldWhCX2Fub255bW91c1VzZXJJZCI%3D=ImQ3ZDFkNDUyLTQ0MTQtNDA4Yy1hMWViLTVhZDI2MTAwY2M0MyI=; pplx.has-discovered-space-mentions=true; pplx.source-selection-v3-space-=[]; pplx.source-selection-v3-space-aace8011-85a6-4e6f-83bd-426a2e3a1513=[]; comet_browser={"browser_version": "139.1.7258.19069", "browser_channel": "stable", "extension_version": "1.0.28", "agent_extension_version": "0.0.110", "device_id": "cc6ae52ccef6604646620d9fb7d28e8be69af3ec161d639a7f52a75185fdfb17", "is_personal_search_enabled": true, "ui_locale": "ja"}; pplx.source-selection-v3-space-ddce9571-ee8e-4dce-8771-0d6b188341b4=[%22web%22]; sidebarHiddenHubs=[]; __cflb=02DiuDyvFMmK5p9jVbVnMNSKYZhUL9aGmdGmW5HX2bVc8; pplx.source-selection-v3-space-7dd64d57-6e85-44b1-98d3-e65b7be5baa6=[]; pplx.search-models-v4={%22research%22:%22pplx_alpha%22%2C%22studio%22:%22pplx_beta%22%2C%22search%22:%22claude37sonnetthinking%22}; colorScheme=dark; __stripe_sid=7125b832-ed72-498f-beed-07421bf5681374b653; __ps_sr=_; __ps_slu=https://www.perplexity.ai/search/https-github-com-helallao-perp-L8tJK.fVQ.yGRaRiWH5qfQ; _rdt_uuid=1756306528109.c1c9a9aa-e799-4a17-a929-a7003a43f20f; __cf_bm=Ux3iYoyrEWbTy8mFocFuE86a9D7jr6zI77.B4bzEtfo-1757088031-1.0.1.1-lF4y3DehN4A8y4lGxip8PIpH_2liUg68rW9.wXipaIqIFAQxGpaBIILGYZhW3Ia4ltGVWt47imCImeLHxmiHt75QNdd9bkuSjFYxyWWooyY; cf_clearance=Te456aHxsuP10lHM.aWd5oAPcmXoEarN26riKIOnUDE-1757088684-1.2.1.1-1FmU3Nn8GFvtq7foc0agu18oKQfLV13mYzxyvDB8zZYQl1Kf0oPvab6HzwAgo46z.754P8X.5YT9lJ.O8v.zNVt.5Bg_UYRzTdqtAkM0oFgJYdvSIZXoHJZLoEEoHXZQlkBNl6cO8W0fNd1g3QYspQvENncNiPM4vcFuejYS24LkLjta1gsaeHZiuJHMuoMBqkprtsf0HAK5_iDMpQW3cqRLc7s8k2PUnluE5oPf_Lk; pplx.metadata={%22qc%22:160%2C%22qcu%22:573%2C%22qcm%22:405%2C%22qcc%22:474%2C%22qcco%22:144%2C%22qccol%22:69%2C%22qcdr%22:0%2C%22qcs%22:0%2C%22qcd%22:48%2C%22hli%22:true%2C%22hcga%22:false%2C%22hcds%22:false%2C%22hso%22:false%2C%22hfo%22:false%2C%22hsma%22:false%2C%22qcr%22:0%2C%22fqa%22:1756306527464%2C%22lqa%22:1757087492838}; lat=35.7180996716357; long=139.99298815233817; AWSALBTG=1Zop/HfbsQRJtCEZMn6Th2V0Lmj1JkLKufBXjMABB2cNUh9vCB6hXJ33n1ofOijXO9Nmbj/+IPNpiu1+ZTRpqb3F5AwNQKsJpTNdOwwX3SOf/iSlf/qY6onhlMU90/SGNtfoXRq9bLNcGXyZyb9ZM7egycTPDeLDDo01aK/7MUp1DnQQU5jHEiKFMZH4iqsyoUqHDeJxCXZB1RhIca3gsClftqJmzb4MG79VUIGTOABvUert82kvVY8sA9aPwrcX; AWSALBTGCORS=1Zop/HfbsQRJtCEZMn6Th2V0Lmj1JkLKufBXjMABB2cNUh9vCB6hXJ33n1ofOijXO9Nmbj/+IPNpiu1+ZTRpqb3F5AwNQKsJpTNdOwwX3SOf/iSlf/qY6onhlMU90/SGNtfoXRq9bLNcGXyZyb9ZM7egycTPDeLDDo01aK/7MUp1DnQQU5jHEiKFMZH4iqsyoUqHDeJxCXZB1RhIca3gsClftqJmzb4MG79VUIGTOABvUert82kvVY8sA9aPwrcX; AWSALB=nORhMYMu21n9GxEwHmI8aGrHJXWOEQXHF6Kp3zkQb3AnESLRJg6SkjHCeLTjpANYpcrmCqvQMkkd1cdsn7/mmOgmirgknB45+gx+xeU630J87N+8IoGizcHviqgSIGfNI0eVdGLW8S9YKCG8IK8b9O0HOX9j+AwuzcdTVqaM/vocjT1ufGmEyqGgaTkl3NS+nag0iP3k3AmxEcRvN6asXyFnx1cW0NR4WtCdDI3db63OQcwvjzoCg/skF2iA9yk=; AWSALBCORS=nORhMYMu21n9GxEwHmI8aGrHJXWOEQXHF6Kp3zkQb3AnESLRJg6SkjHCeLTjpANYpcrmCqvQMkkd1cdsn7/mmOgmirgknB45+gx+xeU630J87N+8IoGizcHviqgSIGfNI0eVdGLW8S9YKCG8IK8b9O0HOX9j+AwuzcdTVqaM/vocjT1ufGmEyqGgaTkl3NS+nag0iP3k3AmxEcRvN6asXyFnx1cW0NR4WtCdDI3db63OQcwvjzoCg/skF2iA9yk=; __Secure-next-auth.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..CqJlPKiQtP3F8WZ5.zOFWFkQjRznp8PH6YFiJdh5mkvUv3KO18eTU-KzaFxTCD5obwCT3ushzoSVImJm4O6kwOSFaL25VyQeRNQH3K5vtscUQ_qoZzHgeBfoqnFQR3JKGbICtLPBBCzQq7bLTfmPEQ59li73PtD6F6ojtkxVG1CpTs-6B9fjHE4UN5JWZcsWpsWnVYQScslBQrdghPqxT8bBbVy7vSFnBiHiUSdoz1YVI7KsJydA6EFFoZ8PB8b-IFmROnAh-MOkHgYz_bvA.SLV-OxQnowvBk7ElckXNtg; _dd_s=aid=ba0f762f-c914-4c65-9ab0-db9c104b5094&rum=2&id=6cbf1aa0-4adb-412d-8aaf-040d91fb6397&created=1757085065361&expire=1757089640954&logs=1'
  });

  try {
    console.log('\nStreaming example (listening in chunks):');
    const gen = await cli.asyncSearch('ストリーミングで自己紹介して', 'pro', null, ['web'], {}, 'ja-JP');

    // 1 回の走査でテキスト断片と backend_uuid を同時に取得する
    let backend_uuid: string | undefined;
    for await (const entry of extractStreamEntries(gen)) {
      if (entry.backend_uuid) backend_uuid = entry.backend_uuid;
      if (entry.text && entry.text.trim()) console.log("entry",entry.text);
    }

    if (backend_uuid) {
      console.log('captured backend_uuid:', backend_uuid);
      const follow = { backend_uuid, attachments: [] };
      const second = await cli.search('この会話の続きで質問します: 私の好きな色は？', 'pro', null, ['web'], {}, 'ja-JP', follow);
      console.log('Follow display_model:', second.display_model);
      console.log('Follow backend_uuid:', second.backend_uuid);
      console.log('Follow answer:', getFirstAskTextAnswer(second));
    } else {
      console.log('No backend_uuid captured from stream; cannot follow up.');
    }
  } catch (e) {
    console.error('error', e);
  }
}

main().catch(e => console.error(e));
