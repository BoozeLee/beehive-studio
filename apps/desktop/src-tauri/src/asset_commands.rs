use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

fn project_assets_dir(project_name: &str) -> Result<PathBuf, String> {
    let dir = crate::git_commands::project_dir(project_name).join("assets");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create assets directory: {}", e))?;
    Ok(dir)
}

fn content_hash(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Failed to open asset: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|e| format!("Failed to read asset: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub async fn consolidate_project_assets(
    project_name: String,
    paths: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    let assets_dir = project_assets_dir(&project_name)?;
    let mut relinked = HashMap::new();

    for source in paths {
        let source_path = Path::new(&source);
        if !source_path.exists() {
            return Err(format!("Sample file not found: {}", source));
        }
        let hash = content_hash(source_path)?;
        let extension = source_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("wav")
            .to_lowercase();
        let filename = format!("{}.{}", hash, extension);
        let target = assets_dir.join(&filename);
        if !target.exists() {
            fs::copy(source_path, &target)
                .map_err(|e| format!("Failed to copy '{}': {}", source, e))?;
        }
        relinked.insert(source, format!("assets/{}", filename));
    }

    Ok(relinked)
}

#[tauri::command]
pub async fn resolve_project_asset(project_name: String, path: String) -> Result<String, String> {
    let candidate = Path::new(&path);
    let resolved = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        crate::git_commands::project_dir(&project_name).join(candidate)
    };
    if !resolved.exists() {
        return Err(format!("Asset not found: {}", resolved.display()));
    }
    Ok(resolved.to_string_lossy().to_string())
}
