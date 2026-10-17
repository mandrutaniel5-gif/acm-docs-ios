// Puts the icon and file details into "ACM Docs.exe" (no Wine needed).
const ResEdit = require('resedit');
const fs = require('fs');
const exe = process.argv[2];
const data = fs.readFileSync(exe);
const pe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(pe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(__dirname + '/icon.ico'));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const groupId = groups.length ? groups[0].id : 1;
const lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [A, B, C] = require('../package.json').version.split('.').map(Number);
vi.setFileVersion(A, B, C, 0, 1033);
vi.setProductVersion(A, B, C, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'ACM Docs', ProductName: 'ACM Docs', CompanyName: 'ACM Code SRL',
  LegalCopyright: '© 2026 ACM Code SRL', OriginalFilename: 'ACM Docs.exe', InternalName: 'ACM Docs',
  FileVersion: `${A}.${B}.${C}`, ProductVersion: `${A}.${B}.${C}`,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(pe);
fs.writeFileSync(exe, Buffer.from(pe.generate()));
console.log('exe updated, icon group', groupId);
