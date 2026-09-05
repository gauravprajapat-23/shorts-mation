import { describe, expect, it } from "vitest";
import { blankDocument } from "./editor-defaults";
import { applyBulkPaste, autofillColumn, buildAlphabetAssetMap, columnsForTemplate, createStudioRow, createTemplateSampleRows, parseDelimitedTable, resolveImportedAssetValues, sampleTemplateCsv, studioRowsToCsv, validateStudioRows } from "./automation-data-studio";
import { STARTER_TEMPLATES } from "./starter-templates";

describe("V2.21 Automation Data Studio",()=>{
  it("creates spreadsheet columns and validates duplicates",()=>{
    const columns=columnsForTemplate(blankDocument("9:16"));
    const a=createStudioRow(columns,0); const b=createStudioRow(columns,1);
    b.values.video_file_name=a.values.video_file_name;
    expect(validateStudioRows([a,b],columns).some((i)=>i.message.includes("Duplicate"))).toBe(true);
  });
  it("bulk pastes TSV from a selected cell",()=>{
    const columns=columnsForTemplate(blankDocument("9:16"));
    const rows=[createStudioRow(columns,0),createStudioRow(columns,1)];
    const next=applyBulkPaste(rows,columns,0,1,"Title A\tDesc A\nTitle B\tDesc B");
    expect(next[0]!.values.title).toBe("Title A");
    expect(next[1]!.values.description).toBe("Desc B");
  });
  it("auto-fills numbered values",()=>{
    const columns=columnsForTemplate(blankDocument("9:16"));
    const rows=[createStudioRow(columns,0),createStudioRow(columns,1),createStudioRow(columns,2)];
    rows[0]!.values.title="Episode 1";
    const next=autofillColumn(rows,"title");
    expect(next[2]!.values.title).toBe("Episode 3");
  });
  it("imports and exports common spreadsheet data",()=>{
    const parsed=parseDelimitedTable("title\tprivacy\nOne\tprivate");
    expect(parsed.headers).toEqual(["title","privacy"]);
    const columns=columnsForTemplate(blankDocument("9:16"));
    expect(studioRowsToCsv([createStudioRow(columns,0)],columns)).toContain("video_file_name");
  });
  it("generates CSV columns from the selected template automation schema",()=>{
    const template=STARTER_TEMPLATES.find((t)=>t.type==="half_cut_word_match");
    if(!template)throw new Error("starter missing");
    const columns=columnsForTemplate(template.doc);
    const csv=sampleTemplateCsv(columns,template.name,3,[]);
    expect(csv).toContain("word");
    expect(csv).toContain("backgroundImage");
    expect(csv).toContain("cta");
    expect(csv).toContain("youtube_thumbnail_asset_id");
    expect(csv).toContain("APPLE");
  });
  it("builds an A-Z asset map from uploaded alphabet file names",()=>{
    const assets=[
      {id:"a-id",file_name:"A.png",type:"image"},
      {id:"b-id",file_name:"letter-B.webp",type:"image"},
      {id:"sound",file_name:"wrong.wav",type:"audio"},
    ];
    const map=buildAlphabetAssetMap(assets);
    expect(map.A).toBe("asset://a-id");
    expect(map.B).toBe("asset://b-id");
    expect(map.C).toBe("");
  });
  it("resolves imported asset file names to durable asset refs",()=>{
    const template=STARTER_TEMPLATES.find((t)=>t.type==="letter_match");
    if(!template)throw new Error("starter missing");
    const columns=columnsForTemplate(template.doc);
    const rows=resolveImportedAssetValues(
      [{objectImage:"ant.png"}],
      {objectImage:"objectImage"},
      columns,
      [{id:"img-1",file_name:"ant.png",type:"image"}],
    );
    expect(rows[0]?.objectImage).toBe("asset://img-1");
  });
  it("creates relational sample values for half-letter templates",()=>{
    const template=STARTER_TEMPLATES.find((t)=>t.type==="half_letter_match");
    if(!template)throw new Error("starter missing");
    const columns=columnsForTemplate(template.doc);
    const row=createTemplateSampleRows(columns,template.name,1,[])[0]!;
    expect(row.values.word).toBe("ANT");
    expect(row.values.letter1).toBe("A");
    expect(row.values.letter2).toBe("N");
    expect(row.values.letter3).toBe("T");
  });

});
