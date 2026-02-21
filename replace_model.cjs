const fs = require('fs');
const file = 'services/geminiService.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/gemini-1\.5-flash/g, 'gemini-2.5-flash');
fs.writeFileSync(file, content);
console.log('Replaced all instances of gemini-1.5-flash with gemini-2.5-flash');
