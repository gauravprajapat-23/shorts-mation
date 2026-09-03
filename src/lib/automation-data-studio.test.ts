import { describe, expect, it } from "vitest";
import { blankDocument } from "./editor-defaults";
import { applyBulkPaste, autofillColumn, columnsForTemplate, createStudioRow, parseDelimitedTable, studioRowsToCsv, validateStudioRows } from "./automation-data-studio";

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
});
