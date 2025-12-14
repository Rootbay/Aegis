use rkyv::{Archive, Deserialize, Serialize};

pub fn serialize<T: Archive + for<'a> Serialize<rkyv::ser::Serializer<'a, rkyv::AlignedVec, rkyv::ser::sharing::Share, ()>>>(value: &T) -> std::io::Result<Vec<u8>> {
    rkyv::to_bytes(value).map(|v| v.to_vec()).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Serialization error: {}", e)))
}

pub fn deserialize<T: Archive + for<'a> Deserialize<T, rkyv::validation::validators::DefaultValidator<'a>>>(bytes: &[u8]) -> std::io::Result<T> {
    rkyv::from_bytes(bytes).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, format!("Deserialization error: {}", e)))
}
