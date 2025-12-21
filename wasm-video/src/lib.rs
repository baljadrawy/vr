use wasm_bindgen::prelude::*;
use web_sys::{console, window, HtmlCanvasElement, CanvasRenderingContext2d, Blob, BlobPropertyBag, Url};
use js_sys::{Array, Uint8Array, Function, Promise};
use serde::{Deserialize, Serialize};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
    
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VideoConfig {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration: u32,
    pub quality: String,
    pub format: String,
}

#[derive(Serialize, Deserialize)]
pub struct ProgressUpdate {
    pub stage: String,
    pub message: String,
    pub progress: u32,
}

#[wasm_bindgen]
pub struct VideoGenerator {
    config: VideoConfig,
    frames: Vec<Vec<u8>>,
}

#[wasm_bindgen]
impl VideoGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32, fps: u32, duration: u32, quality: String, format: String) -> VideoGenerator {
        #[cfg(feature = "console_error_panic_hook")]
        console_error_panic_hook::set_once();
        
        console_log!("🎬 VideoGenerator initialized: {}x{} @ {}fps, {}s", width, height, fps, duration);
        
        VideoGenerator {
            config: VideoConfig {
                width,
                height,
                fps,
                duration,
                quality,
                format,
            },
            frames: Vec::new(),
        }
    }
    
    #[wasm_bindgen]
    pub fn get_total_frames(&self) -> u32 {
        self.config.fps * self.config.duration
    }
    
    #[wasm_bindgen]
    pub fn get_width(&self) -> u32 {
        self.config.width
    }
    
    #[wasm_bindgen]
    pub fn get_height(&self) -> u32 {
        self.config.height
    }
    
    #[wasm_bindgen]
    pub fn add_frame(&mut self, frame_data: &[u8]) {
        self.frames.push(frame_data.to_vec());
        if self.frames.len() % 10 == 0 {
            console_log!("📸 Captured {} frames", self.frames.len());
        }
    }
    
    #[wasm_bindgen]
    pub fn get_frame_count(&self) -> usize {
        self.frames.len()
    }
    
    #[wasm_bindgen]
    pub fn clear_frames(&mut self) {
        self.frames.clear();
        console_log!("🗑️ Frames cleared");
    }
    
    #[wasm_bindgen]
    pub fn get_config_json(&self) -> String {
        serde_json::to_string(&self.config).unwrap_or_default()
    }
}

#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn get_resolution(resolution_type: &str) -> JsValue {
    let (width, height) = match resolution_type {
        "HD_Vertical" => (1080, 1920),
        "HD_Horizontal" => (1920, 1080),
        "Square" => (1080, 1080),
        _ => (1080, 1920),
    };
    
    let result = js_sys::Object::new();
    js_sys::Reflect::set(&result, &"width".into(), &JsValue::from(width)).unwrap();
    js_sys::Reflect::set(&result, &"height".into(), &JsValue::from(height)).unwrap();
    result.into()
}

#[wasm_bindgen]
pub fn reshape_arabic_text(text: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    
    for (i, ch) in chars.iter().enumerate() {
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };
        let next = chars.get(i + 1).copied();
        
        result.push(reshape_arabic_char(*ch, prev, next));
    }
    
    if is_rtl_text(&result) {
        result.chars().rev().collect()
    } else {
        result
    }
}

fn is_rtl_text(text: &str) -> bool {
    text.chars().any(|c| {
        let code = c as u32;
        (0x0600..=0x06FF).contains(&code) || 
        (0x0750..=0x077F).contains(&code) ||
        (0xFB50..=0xFDFF).contains(&code) ||
        (0xFE70..=0xFEFF).contains(&code)
    })
}

fn reshape_arabic_char(ch: char, prev: Option<char>, next: Option<char>) -> char {
    let code = ch as u32;
    
    if !(0x0600..=0x06FF).contains(&code) {
        return ch;
    }
    
    let prev_connects = prev.map(|p| is_arabic_connecting(p)).unwrap_or(false);
    let next_connects = next.map(|n| is_arabic_connecting(n)).unwrap_or(false);
    
    match (prev_connects, next_connects) {
        (true, true) => get_medial_form(ch),
        (true, false) => get_final_form(ch),
        (false, true) => get_initial_form(ch),
        (false, false) => get_isolated_form(ch),
    }
}

fn is_arabic_connecting(ch: char) -> bool {
    let code = ch as u32;
    (0x0621..=0x064A).contains(&code) && !matches!(ch, 'ا' | 'د' | 'ذ' | 'ر' | 'ز' | 'و')
}

fn get_isolated_form(ch: char) -> char { ch }
fn get_initial_form(ch: char) -> char { ch }
fn get_medial_form(ch: char) -> char { ch }
fn get_final_form(ch: char) -> char { ch }

#[wasm_bindgen]
pub fn greet() -> String {
    "🎬 Video Generator WASM Ready!".to_string()
}

#[wasm_bindgen]
pub fn version() -> String {
    "1.0.0".to_string()
}
