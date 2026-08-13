import { randomUUID } from "node:crypto";
import db from "../db.js";
import type {
  ArtisanProfile,
  ServiceCategory,
  ArtisanService,
  PortfolioItem,
  WorkingHours,
  SpecialHours,
  ArtisanLocation,
  ArtisanCertification,
  AvailabilitySlot,
} from "../types.js";

// ============ ARTISAN PROFILE ============

export const artisanService = {
  // Artisan Profile
  async getProfile(artisanId: string): Promise<ArtisanProfile | null> {
    const profile = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    if (!profile) return null;

    return {
      artisanId: profile.artisan_id,
      bio: profile.bio,
      experienceYears: profile.experience_years,
      education: profile.education,
      certifications: profile.certifications,
      skills: profile.skills || [],
      languages: profile.languages || [],
      averageRating: profile.average_rating,
      totalReviews: profile.total_reviews,
      isVerified: profile.is_verified,
      isActive: profile.is_active,
      profileCreatedAt: new Date(profile.profile_created_at).toISOString(),
      profileUpdatedAt: new Date(profile.profile_updated_at).toISOString(),
    };
  },

  async createProfile(artisanId: string, data: Partial<ArtisanProfile>): Promise<ArtisanProfile> {
    const existing = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    if (existing) {
      throw new Error("Profile already exists for this artisan");
    }

    const now = new Date().toISOString();
    await db("artisan_profiles").insert({
      artisan_id: artisanId,
      bio: data.bio || null,
      experience_years: data.experienceYears || null,
      education: data.education || null,
      certifications: data.certifications || null,
      skills: data.skills || [],
      languages: data.languages || [],
      profile_created_at: now,
      profile_updated_at: now,
    });

    const profile = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    return {
      artisanId: profile.artisan_id,
      bio: profile.bio,
      experienceYears: profile.experience_years,
      education: profile.education,
      certifications: profile.certifications,
      skills: profile.skills || [],
      languages: profile.languages || [],
      averageRating: profile.average_rating,
      totalReviews: profile.total_reviews,
      isVerified: profile.is_verified,
      isActive: profile.is_active,
      profileCreatedAt: new Date(profile.profile_created_at).toISOString(),
      profileUpdatedAt: new Date(profile.profile_updated_at).toISOString(),
    };
  },

  async updateProfile(artisanId: string, updates: Partial<ArtisanProfile>): Promise<ArtisanProfile> {
    const profile = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    if (!profile) {
      throw new Error("Profile not found");
    }

    const updateData: Record<string, unknown> = {
      profile_updated_at: new Date().toISOString(),
    };

    if (updates.bio !== undefined) updateData.bio = updates.bio;
    if (updates.experienceYears !== undefined) updateData.experience_years = updates.experienceYears;
    if (updates.education !== undefined) updateData.education = updates.education;
    if (updates.certifications !== undefined) updateData.certifications = updates.certifications;
    if (updates.skills !== undefined) updateData.skills = updates.skills;
    if (updates.languages !== undefined) updateData.languages = updates.languages;

    await db("artisan_profiles").where({ artisan_id: artisanId }).update(updateData);

    const updated = await db("artisan_profiles").where({ artisan_id: artisanId }).first();
    return {
      artisanId: updated.artisan_id,
      bio: updated.bio,
      experienceYears: updated.experience_years,
      education: updated.education,
      certifications: updated.certifications,
      skills: updated.skills || [],
      languages: updated.languages || [],
      averageRating: updated.average_rating,
      totalReviews: updated.total_reviews,
      isVerified: updated.is_verified,
      isActive: updated.is_active,
      profileCreatedAt: new Date(updated.profile_created_at).toISOString(),
      profileUpdatedAt: new Date(updated.profile_updated_at).toISOString(),
    };
  },

  // ============ SERVICES ============

  async listServices(artisanId: string): Promise<ArtisanService[]> {
    const services = await db("artisan_services").where({ artisan_id: artisanId });
    return services.map(svc => ({
      id: svc.id,
      artisanId: svc.artisan_id,
      categoryId: svc.category_id,
      name: svc.name,
      description: svc.description,
      basePrice: svc.base_price,
      currency: svc.currency,
      isAvailable: svc.is_available,
      estimatedDurationMinutes: svc.estimated_duration_minutes,
      serviceDetails: svc.service_details || {},
      createdAt: new Date(svc.created_at).toISOString(),
      updatedAt: new Date(svc.updated_at).toISOString(),
    }));
  },

  async getService(serviceId: string): Promise<ArtisanService | null> {
    const service = await db("artisan_services").where({ id: serviceId }).first();
    if (!service) return null;

    return {
      id: service.id,
      artisanId: service.artisan_id,
      categoryId: service.category_id,
      name: service.name,
      description: service.description,
      basePrice: service.base_price,
      currency: service.currency,
      isAvailable: service.is_available,
      estimatedDurationMinutes: service.estimated_duration_minutes,
      serviceDetails: service.service_details || {},
      createdAt: new Date(service.created_at).toISOString(),
      updatedAt: new Date(service.updated_at).toISOString(),
    };
  },

  async createService(
    artisanId: string,
    categoryId: string,
    data: {
      name: string;
      description?: string;
      basePrice: string;
      currency?: string;
      estimatedDurationMinutes?: number;
      serviceDetails?: Record<string, unknown>;
    }
  ): Promise<ArtisanService> {
    const serviceId = randomUUID();
    const now = new Date().toISOString();

    await db("artisan_services").insert({
      id: serviceId,
      artisan_id: artisanId,
      category_id: categoryId,
      name: data.name,
      description: data.description || null,
      base_price: data.basePrice,
      currency: data.currency || "XLM",
      estimated_duration_minutes: data.estimatedDurationMinutes || null,
      service_details: data.serviceDetails || {},
      created_at: now,
      updated_at: now,
    });

    return {
      id: serviceId,
      artisanId,
      categoryId,
      name: data.name,
      description: data.description || null,
      basePrice: data.basePrice,
      currency: data.currency || "XLM",
      isAvailable: true,
      estimatedDurationMinutes: data.estimatedDurationMinutes || null,
      serviceDetails: data.serviceDetails || {},
      createdAt: now,
      updatedAt: now,
    };
  },

  async updateService(serviceId: string, updates: Partial<ArtisanService>): Promise<ArtisanService> {
    const service = await db("artisan_services").where({ id: serviceId }).first();
    if (!service) throw new Error("Service not found");

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.basePrice !== undefined) updateData.base_price = updates.basePrice;
    if (updates.currency !== undefined) updateData.currency = updates.currency;
    if (updates.isAvailable !== undefined) updateData.is_available = updates.isAvailable;
    if (updates.estimatedDurationMinutes !== undefined)
      updateData.estimated_duration_minutes = updates.estimatedDurationMinutes;
    if (updates.serviceDetails !== undefined) updateData.service_details = updates.serviceDetails;

    await db("artisan_services").where({ id: serviceId }).update(updateData);

    const updated = await db("artisan_services").where({ id: serviceId }).first();
    return {
      id: updated.id,
      artisanId: updated.artisan_id,
      categoryId: updated.category_id,
      name: updated.name,
      description: updated.description,
      basePrice: updated.base_price,
      currency: updated.currency,
      isAvailable: updated.is_available,
      estimatedDurationMinutes: updated.estimated_duration_minutes,
      serviceDetails: updated.service_details || {},
      createdAt: new Date(updated.created_at).toISOString(),
      updatedAt: new Date(updated.updated_at).toISOString(),
    };
  },

  async deleteService(serviceId: string): Promise<void> {
    await db("artisan_services").where({ id: serviceId }).delete();
  },

  // ============ PORTFOLIO ============

  async listPortfolio(artisanId: string): Promise<PortfolioItem[]> {
    const items = await db("portfolio_items")
      .where({ artisan_id: artisanId })
      .orderBy("display_order", "asc")
      .orderBy("created_at", "desc");

    return items.map(item => ({
      id: item.id,
      artisanId: item.artisan_id,
      title: item.title,
      description: item.description,
      images: item.images || [],
      category: item.category,
      completionDate: item.completion_date,
      projectUrl: item.project_url,
      tags: item.tags || [],
      isFeatured: item.is_featured,
      displayOrder: item.display_order,
      createdAt: new Date(item.created_at).toISOString(),
      updatedAt: new Date(item.updated_at).toISOString(),
    }));
  },

  async createPortfolioItem(
    artisanId: string,
    data: {
      title: string;
      description?: string;
      images?: string[];
      category?: string;
      completionDate?: string;
      projectUrl?: string;
      tags?: string[];
    }
  ): Promise<PortfolioItem> {
    const itemId = randomUUID();
    const now = new Date().toISOString();

    await db("portfolio_items").insert({
      id: itemId,
      artisan_id: artisanId,
      title: data.title,
      description: data.description || null,
      images: data.images || [],
      category: data.category || null,
      completion_date: data.completionDate || null,
      project_url: data.projectUrl || null,
      tags: data.tags || [],
      created_at: now,
      updated_at: now,
    });

    return {
      id: itemId,
      artisanId,
      title: data.title,
      description: data.description || null,
      images: data.images || [],
      category: data.category || null,
      completionDate: data.completionDate || null,
      projectUrl: data.projectUrl || null,
      tags: data.tags || [],
      isFeatured: false,
      displayOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
  },

  async updatePortfolioItem(itemId: string, updates: Partial<PortfolioItem>): Promise<PortfolioItem> {
    const item = await db("portfolio_items").where({ id: itemId }).first();
    if (!item) throw new Error("Portfolio item not found");

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.images !== undefined) updateData.images = updates.images;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.completionDate !== undefined) updateData.completion_date = updates.completionDate;
    if (updates.projectUrl !== undefined) updateData.project_url = updates.projectUrl;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.isFeatured !== undefined) updateData.is_featured = updates.isFeatured;
    if (updates.displayOrder !== undefined) updateData.display_order = updates.displayOrder;

    await db("portfolio_items").where({ id: itemId }).update(updateData);

    const updated = await db("portfolio_items").where({ id: itemId }).first();
    return {
      id: updated.id,
      artisanId: updated.artisan_id,
      title: updated.title,
      description: updated.description,
      images: updated.images || [],
      category: updated.category,
      completionDate: updated.completion_date,
      projectUrl: updated.project_url,
      tags: updated.tags || [],
      isFeatured: updated.is_featured,
      displayOrder: updated.display_order,
      createdAt: new Date(updated.created_at).toISOString(),
      updatedAt: new Date(updated.updated_at).toISOString(),
    };
  },

  async deletePortfolioItem(itemId: string): Promise<void> {
    await db("portfolio_items").where({ id: itemId }).delete();
  },

  // ============ WORKING HOURS ============

  async getWorkingHours(artisanId: string): Promise<WorkingHours[]> {
    const hours = await db("working_hours").where({ artisan_id: artisanId });
    return hours.map(h => ({
      id: h.id,
      artisanId: h.artisan_id,
      dayOfWeek: h.day_of_week,
      startTime: h.start_time,
      endTime: h.end_time,
      isAvailable: h.is_available,
      createdAt: new Date(h.created_at).toISOString(),
      updatedAt: new Date(h.updated_at).toISOString(),
    }));
  },

  async setWorkingHours(
    artisanId: string,
    dayOfWeek: string,
    startTime: string,
    endTime: string
  ): Promise<WorkingHours> {
    const existing = await db("working_hours")
      .where({ artisan_id: artisanId, day_of_week: dayOfWeek })
      .first();

    const now = new Date().toISOString();

    if (existing) {
      await db("working_hours")
        .where({ artisan_id: artisanId, day_of_week: dayOfWeek })
        .update({
          start_time: startTime,
          end_time: endTime,
          updated_at: now,
        });

      const updated = await db("working_hours")
        .where({ artisan_id: artisanId, day_of_week: dayOfWeek })
        .first();

      return {
        id: updated.id,
        artisanId: updated.artisan_id,
        dayOfWeek: updated.day_of_week,
        startTime: updated.start_time,
        endTime: updated.end_time,
        isAvailable: updated.is_available,
        createdAt: new Date(updated.created_at).toISOString(),
        updatedAt: new Date(updated.updated_at).toISOString(),
      };
    }

    const hourId = randomUUID();
    await db("working_hours").insert({
      id: hourId,
      artisan_id: artisanId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      created_at: now,
      updated_at: now,
    });

    return {
      id: hourId,
      artisanId,
      dayOfWeek,
      startTime,
      endTime,
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    };
  },

  async toggleWorkingDay(artisanId: string, dayOfWeek: string, isAvailable: boolean): Promise<WorkingHours> {
    const hours = await db("working_hours")
      .where({ artisan_id: artisanId, day_of_week: dayOfWeek })
      .first();

    if (!hours) throw new Error("Working hours not set for this day");

    const now = new Date().toISOString();
    await db("working_hours")
      .where({ artisan_id: artisanId, day_of_week: dayOfWeek })
      .update({
        is_available: isAvailable,
        updated_at: now,
      });

    const updated = await db("working_hours")
      .where({ artisan_id: artisanId, day_of_week: dayOfWeek })
      .first();

    return {
      id: updated.id,
      artisanId: updated.artisan_id,
      dayOfWeek: updated.day_of_week,
      startTime: updated.start_time,
      endTime: updated.end_time,
      isAvailable: updated.is_available,
      createdAt: new Date(updated.created_at).toISOString(),
      updatedAt: new Date(updated.updated_at).toISOString(),
    };
  },

  // ============ SPECIAL HOURS ============

  async listSpecialHours(artisanId: string): Promise<SpecialHours[]> {
    const hours = await db("special_hours").where({ artisan_id: artisanId });
    return hours.map(h => ({
      id: h.id,
      artisanId: h.artisan_id,
      type: h.type,
      startDate: h.start_date,
      endDate: h.end_date,
      reason: h.reason,
      createdAt: new Date(h.created_at).toISOString(),
    }));
  },

  async addSpecialHours(
    artisanId: string,
    type: "holiday" | "vacation" | "special_closure",
    startDate: string,
    endDate: string,
    reason?: string
  ): Promise<SpecialHours> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db("special_hours").insert({
      id,
      artisan_id: artisanId,
      type,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
      created_at: now,
    });

    return {
      id,
      artisanId,
      type,
      startDate,
      endDate,
      reason: reason || null,
      createdAt: now,
    };
  },

  async removeSpecialHours(specialHoursId: string): Promise<void> {
    await db("special_hours").where({ id: specialHoursId }).delete();
  },

  // ============ LOCATIONS ============

  async listLocations(artisanId: string): Promise<ArtisanLocation[]> {
    const locations = await db("artisan_locations").where({ artisan_id: artisanId });
    return locations.map(loc => ({
      id: loc.id,
      artisanId: loc.artisan_id,
      locationName: loc.location_name,
      streetAddress: loc.street_address,
      city: loc.city,
      stateProvince: loc.state_province,
      postalCode: loc.postal_code,
      country: loc.country,
      latitude: loc.latitude,
      longitude: loc.longitude,
      phoneNumber: loc.phone_number,
      isPrimary: loc.is_primary,
      isServiceLocation: loc.is_service_location,
      createdAt: new Date(loc.created_at).toISOString(),
      updatedAt: new Date(loc.updated_at).toISOString(),
    }));
  },

  async createLocation(artisanId: string, data: Omit<ArtisanLocation, "id" | "createdAt" | "updatedAt">): Promise<ArtisanLocation> {
    // If this is the primary location, unset others
    if (data.isPrimary) {
      await db("artisan_locations")
        .where({ artisan_id: artisanId, is_primary: true })
        .update({ is_primary: false });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await db("artisan_locations").insert({
      id,
      artisan_id: artisanId,
      location_name: data.locationName,
      street_address: data.streetAddress,
      city: data.city,
      state_province: data.stateProvince,
      postal_code: data.postalCode,
      country: data.country,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      phone_number: data.phoneNumber || null,
      is_primary: data.isPrimary || false,
      is_service_location: data.isServiceLocation !== false,
      created_at: now,
      updated_at: now,
    });

    return {
      id,
      artisanId,
      locationName: data.locationName,
      streetAddress: data.streetAddress,
      city: data.city,
      stateProvince: data.stateProvince,
      postalCode: data.postalCode,
      country: data.country,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      phoneNumber: data.phoneNumber || null,
      isPrimary: data.isPrimary || false,
      isServiceLocation: data.isServiceLocation !== false,
      createdAt: now,
      updatedAt: now,
    };
  },

  async updateLocation(locationId: string, updates: Partial<ArtisanLocation>): Promise<ArtisanLocation> {
    const location = await db("artisan_locations").where({ id: locationId }).first();
    if (!location) throw new Error("Location not found");

    // If setting as primary, unset others for this artisan
    if (updates.isPrimary) {
      await db("artisan_locations")
        .where({ artisan_id: location.artisan_id, is_primary: true })
        .update({ is_primary: false });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.locationName !== undefined) updateData.location_name = updates.locationName;
    if (updates.streetAddress !== undefined) updateData.street_address = updates.streetAddress;
    if (updates.city !== undefined) updateData.city = updates.city;
    if (updates.stateProvince !== undefined) updateData.state_province = updates.stateProvince;
    if (updates.postalCode !== undefined) updateData.postal_code = updates.postalCode;
    if (updates.country !== undefined) updateData.country = updates.country;
    if (updates.latitude !== undefined) updateData.latitude = updates.latitude;
    if (updates.longitude !== undefined) updateData.longitude = updates.longitude;
    if (updates.phoneNumber !== undefined) updateData.phone_number = updates.phoneNumber;
    if (updates.isPrimary !== undefined) updateData.is_primary = updates.isPrimary;
    if (updates.isServiceLocation !== undefined) updateData.is_service_location = updates.isServiceLocation;

    await db("artisan_locations").where({ id: locationId }).update(updateData);

    const updated = await db("artisan_locations").where({ id: locationId }).first();
    return {
      id: updated.id,
      artisanId: updated.artisan_id,
      locationName: updated.location_name,
      streetAddress: updated.street_address,
      city: updated.city,
      stateProvince: updated.state_province,
      postalCode: updated.postal_code,
      country: updated.country,
      latitude: updated.latitude,
      longitude: updated.longitude,
      phoneNumber: updated.phone_number,
      isPrimary: updated.is_primary,
      isServiceLocation: updated.is_service_location,
      createdAt: new Date(updated.created_at).toISOString(),
      updatedAt: new Date(updated.updated_at).toISOString(),
    };
  },

  async deleteLocation(locationId: string): Promise<void> {
    await db("artisan_locations").where({ id: locationId }).delete();
  },
};
