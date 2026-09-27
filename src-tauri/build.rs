fn main() {
    if cfg!(target_os = "windows") {
        if let Ok(path) = std::env::var("PATH") {
            let llvm_bin = "C:\\llvm-mingw\\bin";
            if !path.starts_with(llvm_bin) {
                std::env::set_var("PATH", format!("{};{}", llvm_bin, path));
            }
        }
    }
    tauri_build::build()
}

