// Icon and file details of "ACM Docs Control.exe".
const ResEdit = require('../../node_modules/resedit');
const fs = require('fs');
const exe = process.argv[2];
const pe = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(pe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(__dirname + '/icon.ico'));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groups.length ? groups[0].id : 1, groups.length ? groups[0].lang : 1033, ico.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [A, B, C] = require('../package.json').version.split('.').map(Number);
vi.setFileVersion(A, B, C, 0, 1033); vi.setProductVersion(A, B, C, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'ACM Docs Control', ProductName: 'ACM Docs Control', CompanyName: 'ACM Code SRL',
  LegalCopyright: '© 2026 ACM Code SRL', OriginalFilename: 'ACM Docs Control.exe', InternalName: 'ACM Docs Control',
  FileVersion: `${A}.${B}.${C}`, ProductVersion: `${A}.${B}.${C}`,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(pe);
fs.writeFileSync(exe, Buffer.from(pe.generate()));
console.log('exe updated');
