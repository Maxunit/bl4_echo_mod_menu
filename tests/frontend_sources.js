'use strict';
/* The same locale and font inputs used by the production builder. */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const languages=JSON.parse(read('src/bl4_echo_mod_menu/languages.json'));
const translations=Object.fromEntries(languages.map(row=>[row.code,JSON.parse(read('ui/locales/'+row.code+'.json'))]));
module.exports={translations,translationsText:JSON.stringify(translations),languageScript:read('ui/language.js')
 .replace('__ECHO_LANGUAGES__',JSON.stringify(languages))
 .replace('__ECHO_LANGUAGE_FONTS__',JSON.stringify(JSON.parse(read('ui/fonts/manifest.json')).fonts))};
