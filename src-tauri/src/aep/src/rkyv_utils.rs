pub fn serialize<T: serde::Serialize>(value: &T) -> bincode::Result<Vec<u8>> {
    bincode::serialize(value)
}
