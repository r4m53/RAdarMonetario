import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = path.resolve("../..");
const allFiles = [
  "data/master/banxico_expectativas_pronosticos.xlsm",
  "data/master/banxico_expectativas_monitor_opiniones.xlsm",
];
const files = process.argv[2] ? allFiles.filter(file => file.includes(process.argv[2])) : allFiles;

for (const relative of files) {
  const fullPath = path.join(root, relative);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(fullPath));
  const overview = await workbook.inspect({
    kind: "workbook,sheet,definedName,drawing,table",
    include: "id,name,type,range,formula",
    maxChars: 30000,
    tableMaxRows: 8,
    tableMaxCols: 12,
    tableMaxCellChars: 120,
  });
  const outputName = `${path.basename(relative, ".xlsm")}-overview.ndjson`;
  await fs.writeFile(outputName, overview.ndjson, "utf8");
  console.log(`${relative} -> ${outputName}`);
}
