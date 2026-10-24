#![windows_subsystem = "windows"]
// Test-only executable: records the real updater's arguments; never installs anything.
fn main() {
    let path = std::env::var("DUO_TEST_INSTALL_MARKER").expect("test marker path");
    std::fs::write(path, std::env::args().collect::<Vec<_>>().join("\n")).unwrap();
}
