const fs = require('fs');
const glob = require('glob'); // Note: if glob is not installed, we can just walk the directory.

// Simple recursive walk
function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.ts')) results.push(file);
        }
    });
    return results;
}

const files = walk('./src');
let count = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Fix arrow functions without parens that got typed
    // e.g.   p: any =>   becomes   (p: any) =>
    // We use a regex: match word boundary, word, ": any =>"
    const regex = /\b([a-zA-Z0-9_]+):\s*any\s*=>/g;
    
    if (regex.test(content)) {
        content = content.replace(regex, '($1: any) =>');
        fs.writeFileSync(file, content);
        count++;
        console.log(`Fixed syntax in ${file}`);
    }
}
console.log(`Fixed ${count} files.`);
