use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use serde::Serialize;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

/// Bundle entregue ao frontend: o project.json e o conteúdo de cada arquivo
/// (caminho relativo → texto). Campos em snake_case para casar com o TS sem
/// depender de conversão de caixa do Tauri.
#[derive(Serialize)]
pub struct ProjectBundle {
    pub project_json: String,
    pub files: HashMap<String, String>,
}

#[tauri::command]
pub fn read_project(path: String) -> Result<ProjectBundle, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut project_json = String::new();
    let mut files = HashMap::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() { continue; }
        let name = entry.name().to_string();
        let mut content = String::new();
        entry.read_to_string(&mut content).map_err(|e| e.to_string())?;
        if name == "project.json" { project_json = content; } else { files.insert(name, content); }
    }
    if project_json.is_empty() {
        return Err("project.json ausente no .notker".into());
    }
    Ok(ProjectBundle { project_json, files })
}

#[tauri::command]
pub fn write_project(
    path: String,
    project_json: String,
    files: HashMap<String, String>,
) -> Result<(), String> {
    let mut buf = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut buf);
        let opts = SimpleFileOptions::default();
        zip.start_file("project.json", opts).map_err(|e| e.to_string())?;
        zip.write_all(project_json.as_bytes()).map_err(|e| e.to_string())?;
        for (name, content) in &files {
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            zip.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        }
        zip.finish().map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, buf.into_inner()).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_project() {
        let path = std::env::temp_dir()
            .join("notker-roundtrip-test.notker")
            .to_string_lossy()
            .to_string();
        let mut files = HashMap::new();
        files.insert("gabc/001-a.gabc".to_string(), "name: A;\n%%\n(c4) a".to_string());
        write_project(path.clone(), "{\"schema\":1}".to_string(), files).unwrap();
        let b = read_project(path.clone()).unwrap();
        assert_eq!(b.project_json, "{\"schema\":1}");
        assert_eq!(b.files.get("gabc/001-a.gabc").unwrap(), "name: A;\n%%\n(c4) a");
        std::fs::remove_file(&path).ok();
    }
}
