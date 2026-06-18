use crate::{MidiEvent, Plugin, PluginError, Result};
use std::sync::{Arc, Mutex};
use wasmtime::*;

pub struct WasmPlugin {
    id: String,
    name: String,
    version: String,
    
    // Wasmtime internals
    store: Arc<Mutex<Store<()>>>,
    instance: Instance,
    
    // Exported functions we will call
    init_func: TypedFunc<(u32, u32), ()>,
    process_audio_func: TypedFunc<(u32, u32), ()>,
    on_midi_func: TypedFunc<(u32, u32), ()>,
    cleanup_func: TypedFunc<(), ()>,
    
    // Memory exported from the WASM module
    memory: Memory,
}

impl WasmPlugin {
    pub fn new(id: &str, name: &str, version: &str, wasm_bytes: &[u8]) -> Result<Self> {
        let engine = Engine::default();
        let module = Module::new(&engine, wasm_bytes)
            .map_err(|e| PluginError::InitFailed(format!("Invalid WASM module: {}", e)))?;
            
        let mut store = Store::new(&engine, ());
        let linker = Linker::new(&engine);
        
        // In the future, we can add host functions to the linker here
        // e.g. host_print, request_network, etc. (sandboxing applied here)
        
        let instance = linker.instantiate(&mut store, &module)
            .map_err(|e| PluginError::InitFailed(format!("Failed to instantiate WASM: {}", e)))?;
            
        let memory = instance.get_memory(&mut store, "memory")
            .ok_or_else(|| PluginError::InitFailed("WASM module must export 'memory'".into()))?;
            
        let init_func = instance.get_typed_func::<(u32, u32), ()>(&mut store, "init")
            .map_err(|e| PluginError::InitFailed(format!("Missing or invalid 'init' export: {}", e)))?;
            
        let process_audio_func = instance.get_typed_func::<(u32, u32), ()>(&mut store, "process_audio")
            .map_err(|e| PluginError::InitFailed(format!("Missing or invalid 'process_audio' export: {}", e)))?;
            
        let on_midi_func = instance.get_typed_func::<(u32, u32), ()>(&mut store, "on_midi")
            .map_err(|e| PluginError::InitFailed(format!("Missing or invalid 'on_midi' export: {}", e)))?;
            
        let cleanup_func = instance.get_typed_func::<(), ()>(&mut store, "cleanup")
            .map_err(|e| PluginError::InitFailed(format!("Missing or invalid 'cleanup' export: {}", e)))?;
            
        Ok(Self {
            id: id.to_string(),
            name: name.to_string(),
            version: version.to_string(),
            store: Arc::new(Mutex::new(store)),
            instance,
            init_func,
            process_audio_func,
            on_midi_func,
            cleanup_func,
            memory,
        })
    }
}

impl Plugin for WasmPlugin {
    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn version(&self) -> &str {
        &self.version
    }

    fn init(&mut self, sample_rate: u32, buffer_size: usize) -> Result<()> {
        let mut store = self.store.lock().unwrap();
        self.init_func.call(&mut *store, (sample_rate, buffer_size as u32))
            .map_err(|e| PluginError::Internal(format!("WASM init error: {}", e)))?;
        Ok(())
    }

    fn process_audio(&mut self, buffer: &mut [f32]) -> Result<()> {
        let mut store = self.store.lock().unwrap();
        
        // 1. We write the host's f32 buffer into the WASM module's memory space.
        // For simplicity, we assume the WASM module exports an `allocate(size)` 
        // function or has a static buffer. To keep this example concise, we'll write 
        // directly to offset 0 (which is dangerous in a real plugin if offset 0 is used).
        // Ideally: call `let ptr = instance.get_typed_func("alloc").call(buffer.len())`
        
        let ptr = 0; // Using 0 as a placeholder for the WASM memory buffer pointer
        let buffer_bytes = unsafe {
            std::slice::from_raw_parts(
                buffer.as_ptr() as *const u8,
                buffer.len() * std::mem::size_of::<f32>()
            )
        };
        
        self.memory.write(&mut *store, ptr, buffer_bytes)
            .map_err(|e| PluginError::Internal(format!("Failed to write to WASM memory: {}", e)))?;
            
        // 2. Call the WASM processing function, passing the pointer and length
        self.process_audio_func.call(&mut *store, (ptr as u32, buffer.len() as u32))
            .map_err(|e| PluginError::Internal(format!("WASM process_audio error: {}", e)))?;
            
        // 3. Read the modified f32 buffer back into the host's buffer
        self.memory.read(&*store, ptr, unsafe {
            std::slice::from_raw_parts_mut(
                buffer.as_mut_ptr() as *mut u8,
                buffer.len() * std::mem::size_of::<f32>()
            )
        }).map_err(|e| PluginError::Internal(format!("Failed to read from WASM memory: {}", e)))?;
        
        Ok(())
    }

    fn on_midi(&mut self, _events: &[MidiEvent]) -> Result<()> {
        // Similar to process_audio:
        // Serialize MidiEvents into a byte array, write to WASM memory,
        // then call `on_midi_func(ptr, len)`.
        Ok(())
    }

    fn cleanup(&mut self) -> Result<()> {
        let mut store = self.store.lock().unwrap();
        self.cleanup_func.call(&mut *store, ())
            .map_err(|e| PluginError::Internal(format!("WASM cleanup error: {}", e)))?;
        Ok(())
    }
}
